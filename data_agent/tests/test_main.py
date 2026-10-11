import time

import jwt
import pytest
from fastapi.testclient import TestClient

from auth import AUDIENCE, ISSUER
from config import Settings
from main import create_app
from tests.conftest import CSV
from tests.fakes import FakeToolChatModel, final, run_code

SECRET = "k" * 32


def settings(**kw):
    base = dict(internal_service_secret=SECRET, csv_path=CSV, llm_provider="fake", llm_model="fake-model")
    base.update(kw)
    return Settings(**base)


def auth_header():
    claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": "user-1", "jti": "req-1", "exp": int(time.time()) + 60}
    return {"Authorization": f"Bearer {jwt.encode(claims, SECRET, algorithm='HS256')}"}


def client_with(responses, **kw):
    llm = FakeToolChatModel(responses=responses)
    return TestClient(create_app(settings(**kw), llm_factory=lambda s: llm))


def test_health_pubblico_con_info():
    res = client_with([]).get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok" and body["righe"] == 12240 and body["modello"] == "fake:fake-model"


def test_analyze_richiede_token():
    res = client_with([]).post("/analyze", json={"domanda": "x"})
    assert res.status_code == 401


def test_analyze_end_to_end():
    code = "d = pulisci_dataset()\nprint(crea_grafico(margine(d, 'cliente'), 'bar', x='cliente', y='margine_pct', titolo='Margine per cliente', formato_y='percent'))"
    client = client_with([run_code(code), final("CasaViva Arredo è in perdita.")])
    res = client.post("/analyze", headers=auth_header(),
                      json={"domanda": "Margine per cliente?", "genera_grafico": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sintesi"] == "CasaViva Arredo è in perdita."
    assert body["artifacts"][0]["kind"] == "chart" and body["artifacts"][0]["yFormat"] == "percent"
    assert body["artifacts_riepilogo"] == ["grafico bar: 'Margine per cliente' (10 punti)"]
    assert body["pulizia"] and body["codice_eseguito"]
    assert {u["model"] for u in body["usage"]} == {"fake-model"}


@pytest.mark.parametrize("payload", [{}, {"domanda": ""}, {"domanda": "x" * 2001}, {"domanda": "ok", "regole_da_applicare": "r" * 4001}])
def test_analyze_valida_input(payload):
    assert client_with([]).post("/analyze", headers=auth_header(), json=payload).status_code == 422


def test_errore_del_modello_502():
    class Broken(FakeToolChatModel):
        def _generate(self, *a, **k):
            raise RuntimeError("quota esaurita")

    client = TestClient(create_app(settings(), llm_factory=lambda s: Broken(responses=[])))
    res = client.post("/analyze", headers=auth_header(), json={"domanda": "x"})
    assert res.status_code == 502
    assert "quota esaurita" in res.json()["detail"]


def test_timeout_504():
    class Slow(FakeToolChatModel):
        def _generate(self, *a, **k):
            time.sleep(1.5)
            return super()._generate(*a, **k)

    client = TestClient(create_app(settings(timeout_s=0.3), llm_factory=lambda s: Slow(responses=[final("tardi")])))
    res = client.post("/analyze", headers=auth_header(), json={"domanda": "x"})
    assert res.status_code == 504


def test_data_quality_protetto_e_completo():
    client = client_with([])
    assert client.get("/data-quality").status_code == 401
    body = client.get("/data-quality", headers=auth_header()).json()
    assert body["righe_iniziali"] == 12240
    assert body["conteggi"]["duplicati_rimossi"] == 240
    assert body["descrizione"]


def test_llm_creato_solo_alla_prima_analisi():
    created = []

    def factory(s):
        created.append(s.model_id)
        return FakeToolChatModel(responses=[final("ok")])

    client = TestClient(create_app(settings(), llm_factory=factory))
    client.get("/health")
    assert created == []
    client.post("/analyze", headers=auth_header(), json={"domanda": "x"})
    assert created == ["fake:fake-model"]
