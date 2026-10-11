import time

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from auth import AUDIENCE, ISSUER, service_auth

SECRET = "s" * 32


def token(**overrides):
    claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": "user-1", "jti": "req-1", "exp": int(time.time()) + 60}
    claims.update(overrides)
    return jwt.encode(claims, overrides.pop("secret", SECRET) if "secret" in overrides else SECRET, algorithm="HS256")


@pytest.fixture
def client():
    app = FastAPI()

    @app.get("/protetto")
    def protetto(claims: dict = Depends(service_auth(SECRET))):
        return {"sub": claims["sub"]}

    return TestClient(app)


def test_senza_token_401(client):
    assert client.get("/protetto").status_code == 401


def test_token_valido(client):
    res = client.get("/protetto", headers={"Authorization": f"Bearer {token()}"})
    assert res.status_code == 200
    assert res.json() == {"sub": "user-1"}


@pytest.mark.parametrize("bad", [
    {"aud": "altro-servizio"},
    {"iss": "qualcun-altro"},
    {"exp": int(time.time()) - 5},
])
def test_token_non_validi(client, bad):
    assert client.get("/protetto", headers={"Authorization": f"Bearer {token(**bad)}"}).status_code == 401


def test_firma_con_segreto_diverso(client):
    forged = jwt.encode({"iss": ISSUER, "aud": AUDIENCE, "sub": "x", "exp": int(time.time()) + 60}, "z" * 32, algorithm="HS256")
    assert client.get("/protetto", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_algoritmo_none_rifiutato(client):
    unsigned = jwt.encode({"iss": ISSUER, "aud": AUDIENCE, "sub": "x", "exp": int(time.time()) + 60}, None, algorithm="none")
    assert client.get("/protetto", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_scadenza_troppo_lunga_rifiutata(client):
    """Il backend firma token da 60 s: un token valido per ore è sospetto."""
    assert client.get("/protetto", headers={"Authorization": f"Bearer {token(exp=int(time.time()) + 3600)}"}).status_code == 401
