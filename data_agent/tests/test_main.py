import time

import jwt
import pytest
from fastapi.testclient import TestClient

from auth import AUDIENCE, ISSUER
from config import Settings
from main import create_app
from tests.conftest import CSV
from tests.fakes import FakeToolChatModel, call_tools, final

SECRET = "k" * 32


def settings(**kw):
    base = dict(internal_service_secret=SECRET, csv_path=CSV, llm_provider="fake", llm_model="fake-model")
    base.update(kw)
    return Settings(**base)


def auth_header():
    claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": "user-1", "jti": "req-1", "exp": int(time.time()) + 60}
    return {"Authorization": f"Bearer {jwt.encode(claims, SECRET, algorithm='HS256')}"}


MARGINE = [
    call_tools(("calcola_margine", {"raggruppa_per": ["cliente"]})),
    call_tools(("crea_grafico", {"risultato": "R1", "tipo": "bar", "x": "cliente", "y": "margine_pct", "titolo": "Margine per cliente", "formato_y": "percent"})),
    final("CasaViva Arredo è in perdita."),
]


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
    client = client_with(MARGINE)
    res = client.post("/analyze", headers=auth_header(),
                      json={"domanda": "Margine per cliente?", "genera_grafico": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sintesi"] == "CasaViva Arredo è in perdita."
    assert body["artifacts"][0]["kind"] == "chart" and body["artifacts"][0]["yFormat"] == "percent"
    assert body["artifacts_riepilogo"] == ["grafico bar: 'Margine per cliente' (10 punti)"]
    assert body["pulizia"] and body["codice_eseguito"]
    assert {u["model"] for u in body["usage"]} == {"fake-model"}
    assert body["dalla_cache"] is False


def test_domanda_ripetuta_risposta_dalla_cache_senza_chiamare_il_modello():
    llm = FakeToolChatModel(responses=MARGINE)
    client = TestClient(create_app(settings(), llm_factory=lambda s: llm))
    prima = client.post("/analyze", headers=auth_header(), json={"domanda": "Margine per cliente?", "genera_grafico": True}).json()
    chiamate = len(llm.ricevuti)
    # Stessa domanda scritta in modo diverso: maiuscole, spazi e punteggiatura non contano.
    seconda = client.post("/analyze", headers=auth_header(), json={"domanda": "  margine per CLIENTE ", "genera_grafico": True}).json()
    assert len(llm.ricevuti) == chiamate
    assert seconda["dalla_cache"] is True and seconda["usage"] == []
    assert seconda["sintesi"] == prima["sintesi"]
    assert seconda["artifacts"][0]["data"] == prima["artifacts"][0]["data"]
    assert seconda["artifacts"][0]["id"] != prima["artifacts"][0]["id"]
    assert seconda["cache"] == {"tipo": "uguale", "domanda_originale": "Margine per cliente?"}
    assert client.get("/health").json()["cache"] == {"attiva": True, "parafrasi": False, "voci": 1, "hit_uguali": 1,
                                                     "hit_parafrasi": 0, "miss": 1, "ttl_s": 3600, "soglia": 0.6}


def test_parafrasi_risposta_dalla_cache_con_costo_dell_embedding():
    llm = FakeToolChatModel(responses=MARGINE * 2)
    embedded: list[str] = []

    def factory(s):
        assert s.embedding_id == "openai:text-embedding-3-small"
        return lambda testo: embedded.append(testo) or [1.0, 0.0]

    client = TestClient(create_app(settings(embedding_provider="openai", embedding_model="text-embedding-3-small"),
                                   llm_factory=lambda s: llm, embedder_factory=factory))
    prima = client.post("/analyze", headers=auth_header(), json={"domanda": "Qual è il margine per cliente nel 2026?", "genera_grafico": True}).json()
    assert prima["dalla_cache"] is False and prima["usage"][0]["model"] == "text-embedding-3-small"
    chiamate = len(llm.ricevuti)
    seconda = client.post("/analyze", headers=auth_header(), json={"domanda": "Quanto guadagniamo su ogni cliente nel 2026?", "genera_grafico": True}).json()
    assert len(llm.ricevuti) == chiamate  # nessuna nuova analisi
    assert seconda["dalla_cache"] is True and seconda["sintesi"] == prima["sintesi"]
    assert seconda["cache"] == {"tipo": "parafrasi", "domanda_originale": "Qual è il margine per cliente nel 2026?", "similarita": 1.0}
    assert [u["model"] for u in seconda["usage"]] == ["text-embedding-3-small"]  # unico costo: l'embedding
    # Stessa forma ma anno diverso: firma diversa, nuova analisi.
    terza = client.post("/analyze", headers=auth_header(), json={"domanda": "Quanto guadagniamo su ogni cliente nel 2025?", "genera_grafico": True})
    assert terza.json()["dalla_cache"] is False and len(llm.ricevuti) > chiamate
    assert len(embedded) == 3


def test_cache_disattivata_o_richiesta_diversa_richiama_il_modello():
    llm = FakeToolChatModel(responses=[final("a"), final("b"), final("c")])
    client = TestClient(create_app(settings(), llm_factory=lambda s: llm))
    assert client.post("/analyze", headers=auth_header(), json={"domanda": "volumi"}).json()["sintesi"] == "a"
    assert client.post("/analyze", headers=auth_header(), json={"domanda": "volumi", "genera_grafico": True}).json()["sintesi"] == "b"
    spenta = TestClient(create_app(settings(cache_ttl_s=0), llm_factory=lambda s: FakeToolChatModel(responses=[final("x"), final("y")])))
    assert [spenta.post("/analyze", headers=auth_header(), json={"domanda": "volumi"}).json()["sintesi"] for _ in range(2)] == ["x", "y"]


def test_gli_errori_non_finiscono_in_cache():
    class FlakyOnce(FakeToolChatModel):
        def _generate(self, *a, **k):
            if not self.ricevuti:
                self.ricevuti.append([])
                raise RuntimeError("quota esaurita")
            return super()._generate(*a, **k)

    client = TestClient(create_app(settings(), llm_factory=lambda s: FlakyOnce(responses=[final("ok")])))
    assert client.post("/analyze", headers=auth_header(), json={"domanda": "x"}).status_code == 502
    assert client.post("/analyze", headers=auth_header(), json={"domanda": "x"}).json()["sintesi"] == "ok"


def test_analisi_interrotta_non_finisce_in_cache():
    giro = call_tools(("aggrega", {"misure": [{"operazione": "conteggio"}]}))
    client = client_with([giro, final("completa")], max_iterations=1)
    prima = client.post("/analyze", headers=auth_header(), json={"domanda": "x"}).json()
    assert prima["sintesi"].startswith("Analisi interrotta") and "completa" not in prima
    assert client.post("/analyze", headers=auth_header(), json={"domanda": "x"}).json()["sintesi"] == "completa"


def test_csv_non_valido_il_servizio_non_parte(tmp_path, raw_df):
    from dataset import DatasetNonValido

    rotto = tmp_path / "rotto.csv"
    raw_df.drop(columns=["stato"]).to_csv(rotto, index=False)
    with pytest.raises(DatasetNonValido, match="colonne mancanti: stato"):
        create_app(settings(csv_path=rotto))


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
    assert body["validazione"] == {"valido": True, "righe": 12240, "errori": [], "avvisi": []}


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


def test_factory_reale_senza_temperature(monkeypatch):
    """I modelli di ragionamento rifiutano temperature != default: la factory non deve impostarla."""
    import main

    captured = {}
    monkeypatch.setattr("langchain.chat_models.init_chat_model", lambda model, **kw: captured.update(model=model, **kw))
    main.default_llm_factory(settings(llm_provider="openai", llm_model="gpt-5.4-mini"))
    assert captured == {"model": "openai:gpt-5.4-mini"}
