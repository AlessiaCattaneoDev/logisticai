"""Data agent LogisticAI: microservizio FastAPI per l'analisi dello storico spedizioni.

Avvio:  .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
"""
from __future__ import annotations

import asyncio
import threading
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from agent import AnalysisError, DataAnalyst
from auth import service_auth
from cache import CacheAnalisi, Ricerca, impronta_file
from cleaning import pulisci_dataset
from config import Settings
from dataset import DatasetNonValido, carica_dataset
from strumenti import COLONNE_FILTRO, valori_ammessi

LlmFactory = Callable[[Settings], Any]
EmbedderFactory = Callable[[Settings], Callable[[str], list[float]]]


def default_llm_factory(settings: Settings) -> Any:
    from langchain.chat_models import init_chat_model

    # Niente temperature: i modelli di ragionamento (es. GPT-5) accettano solo il valore di default.
    return init_chat_model(settings.model_id)


def entita_della_cache(pulito: Any) -> dict[str, str]:
    """Valori dei dati citabili nelle domande (alias -> nome). I clienti dal nome composto valgono anche
    con la sola prima parola ("CasaViva" = "CasaViva Arredo"), se non è ambigua."""
    entita = {v: v for col in COLONNE_FILTRO for v in valori_ammessi(pulito, col)}
    primi = [v.split()[0] for v in valori_ammessi(pulito, "cliente") if " " in v]
    for v in valori_ammessi(pulito, "cliente"):
        primo = v.split()[0]
        if " " in v and len(primo) >= 5 and primi.count(primo) == 1 and primo not in entita:
            entita[primo] = v
    return entita


def default_embedder_factory(settings: Settings) -> Callable[[str], list[float]]:
    from langchain.embeddings import init_embeddings

    return init_embeddings(settings.embedding_id).embed_query


class AnalyzeRequest(BaseModel):
    domanda: str = Field(min_length=1, max_length=2000)
    genera_grafico: bool = False
    regole_da_applicare: str | None = Field(default=None, max_length=4000)


def create_app(settings: Settings, llm_factory: LlmFactory = default_llm_factory,
               embedder_factory: EmbedderFactory = default_embedder_factory) -> FastAPI:
    app = FastAPI(title="LogisticAI Data Agent", version="0.1.0")
    # Colonne e tipi controllati all'avvio: con un CSV sbagliato il servizio non parte (DatasetNonValido).
    df_raw, validazione = carica_dataset(settings.csv_path)
    pulito, quality_report = pulisci_dataset(df_raw)
    requires_service = service_auth(settings.internal_service_secret)
    state: dict[str, Any] = {}
    lock = threading.Lock()

    def embedder(testo: str) -> list[float]:
        with lock:  # client creato alla prima richiesta, come l'LLM
            if "embedder" not in state:
                state["embedder"] = embedder_factory(settings)
        return state["embedder"](testo)

    cache = CacheAnalisi(
        settings.cache_max_voci, settings.cache_ttl_s, impronta_dati=impronta_file(settings.csv_path),
        embedder=embedder if settings.embedding_id else None, soglia=settings.cache_soglia,
        entita=entita_della_cache(pulito),
    )

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
        return {"status": "ok", "righe": len(df_raw), "modello": settings.model_id,
                "avvisi_dataset": len(validazione.avvisi), "cache": cache.stato()}

    @app.get("/data-quality")
    def data_quality(_claims: dict = Depends(requires_service)) -> dict:
        return {**quality_report.as_dict(), "validazione": validazione.as_dict()}

    def uso_embedding(ricerca: Ricerca, domanda: str) -> list[dict]:
        if ricerca.vettore is None:
            return []
        # embed_query non restituisce i token: stima di ~4 caratteri per token (costo dell'ordine di 1e-7 €).
        return [{"provider": settings.embedding_provider, "model": settings.embedding_model,
                 "input_tokens": max(1, len(domanda) // 4), "output_tokens": 0, "latency_ms": ricerca.embedding_ms or 0}]

    @app.post("/analyze")
    async def analyze(req: AnalyzeRequest, _claims: dict = Depends(requires_service)) -> dict:
        ricerca = await asyncio.to_thread(cache.cerca, req.domanda, req.genera_grafico, req.regole_da_applicare)
        embedding = uso_embedding(ricerca, req.domanda)
        if ricerca.valore is not None:
            # Nessuna analisi (al massimo l'embedding della domanda); id nuovi perché gli artifact finiscono in un altro messaggio.
            salvata = ricerca.valore
            for a in salvata["artifacts"]:
                a["id"] = str(uuid.uuid4())
            dettaglio = {"tipo": ricerca.tipo, "domanda_originale": ricerca.domanda_originale}
            if ricerca.similarita is not None:
                dettaglio["similarita"] = ricerca.similarita
            return {**salvata, "usage": embedding, "dalla_cache": True, "cache": dettaglio}
        try:
            risposta = await asyncio.wait_for(
                asyncio.to_thread(analyst().analyze, req.domanda, req.genera_grafico, req.regole_da_applicare),
                timeout=settings.timeout_s,
            )
        except asyncio.TimeoutError:
            raise HTTPException(504, f"Analisi oltre il tempo massimo di {settings.timeout_s:g} secondi") from None
        except AnalysisError as err:
            raise HTTPException(502, str(err)) from None
        if risposta.pop("completa"):
            cache.salva(ricerca, req.domanda, risposta)
        return {**risposta, "usage": embedding + risposta["usage"], "dalla_cache": False}

    return app


def _app_from_env() -> FastAPI:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    try:
        return create_app(Settings.from_env())
    except DatasetNonValido as err:
        raise SystemExit(f"Data agent non avviato. {err}") from None


def __getattr__(name: str) -> FastAPI:
    # `uvicorn main:app` crea l'app solo all'avvio: importare il modulo nei test non legge il .env.
    if name == "app":
        return _app_from_env()
    raise AttributeError(name)
