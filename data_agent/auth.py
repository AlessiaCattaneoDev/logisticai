"""Autenticazione servizio-servizio: solo il backend può chiamare il data agent.

Il backend firma per ogni richiesta un JWT HS256 di breve durata con il segreto condiviso
INTERNAL_SERVICE_SECRET (iss=logisticai-backend, aud=data-agent, exp <= 60 s).
"""
from __future__ import annotations

import time
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ISSUER = "logisticai-backend"
AUDIENCE = "data-agent"
MAX_TTL_S = 120  # tolleranza sul TTL di 60 s firmato dal backend

_bearer = HTTPBearer(auto_error=False)


def verify_service_token(token: str, secret: str) -> dict:
    claims = jwt.decode(
        token, secret, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER,
        options={"require": ["exp", "iss", "aud", "sub"]},
    )
    if claims["exp"] - time.time() > MAX_TTL_S:
        raise jwt.InvalidTokenError("scadenza troppo lontana")
    return claims


def service_auth(secret: str) -> Callable[..., dict]:
    def dependency(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
        if credentials is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token di servizio mancante")
        try:
            return verify_service_token(credentials.credentials, secret)
        except jwt.PyJWTError:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token di servizio non valido") from None

    return dependency
