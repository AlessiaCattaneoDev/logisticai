"""Data agent LogisticAI: microservizio FastAPI per l'analisi dello storico spedizioni.

Avvio:  .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
"""
from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from agent import AnalysisError, DataAnalyst
from auth import service_auth
from cleaning import pulisci_dataset
from config import Settings
from dataset import load_raw

LlmFactory = Callable[[Settings], Any]


def default_llm_factory(settings: Settings) -> Any:
    from langchain.chat_models import init_chat_model

    # Niente temperature: i modelli di ragionamento (es. GPT-5) accettano solo il valore di default.
    return init_chat_model(settings.model_id)


class AnalyzeRequest(BaseModel):
    domanda: str = Field(min_length=1, max_length=2000)
    genera_grafico: bool = False
    regole_da_applicare: str | None = Field(default=None, max_length=4000)


def create_app(settings: Settings, llm_factory: LlmFactory = default_llm_factory) -> FastAPI:
    app = FastAPI(title="LogisticAI Data Agent", version="0.1.0")
    df_raw = load_raw(settings.csv_path)
    _, quality_report = pulisci_dataset(df_raw)
    requires_service = service_auth(settings.internal_service_secret)
    state: dict[str, DataAnalyst] = {}
    lock = threading.Lock()

    def analyst() -> DataAnalyst:
        with lock:
            if "analyst" not in state:
                state["analyst"] = DataAnalyst(
                    df_raw, llm_factory(settings), provider=settings.llm_provider, model=settings.llm_model,
                    max_iterations=settings.max_iterations, timeout_s=settings.timeout_s,
                )
            return state["analyst"]

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "righe": len(df_raw), "modello": settings.model_id}

    @app.get("/data-quality")
    def data_quality(_claims: dict = Depends(requires_service)) -> dict:
        return quality_report.as_dict()

    @app.post("/analyze")
    async def analyze(req: AnalyzeRequest, _claims: dict = Depends(requires_service)) -> dict:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(analyst().analyze, req.domanda, req.genera_grafico, req.regole_da_applicare),
                timeout=settings.timeout_s,
            )
        except asyncio.TimeoutError:
            raise HTTPException(504, f"Analisi oltre il tempo massimo di {settings.timeout_s:g} secondi") from None
        except AnalysisError as err:
            raise HTTPException(502, str(err)) from None

    return app


def _app_from_env() -> FastAPI:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    return create_app(Settings.from_env())


def __getattr__(name: str) -> FastAPI:
    # `uvicorn main:app` crea l'app solo all'avvio: importare il modulo nei test non legge il .env.
    if name == "app":
        return _app_from_env()
    raise AttributeError(name)
