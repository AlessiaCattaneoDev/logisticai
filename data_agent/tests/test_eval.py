"""Valutazioni con LLM REALE (costano qualche centesimo). Escluse di default.

Esecuzione:  .venv/bin/python -m pytest -m eval -v   (richiede il .env compilato)
Misurano se l'agente, con il modello configurato, arriva ai numeri attesi dal dataset.
"""
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from config import Settings

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

pytestmark = [
    pytest.mark.eval,
    pytest.mark.skipif(not os.getenv("DATA_LLM_MODEL"), reason="DATA_LLM_MODEL non configurato"),
]

REGOLE_MODANOVA = (
    "Soglia di puntualità 95%. Penale 1.000 € per ogni punto percentuale sotto soglia, tetto 5.000 € al mese. "
    "Escludere dal calcolo: Meteo avverso, Destinatario assente, Indirizzo errato e spedizioni In transito. "
    "Penale non applicabile sotto 50 spedizioni nel mese."
)


@pytest.fixture(scope="module")
def analyst():
    from agent import DataAnalyst
    from config import Settings
    from dataset import load_raw
    from main import default_llm_factory

    s = Settings.from_env()
    return DataAnalyst(load_raw(s.csv_path), default_llm_factory(s), provider=s.llm_provider, model=s.llm_model)


def test_penale_modanova_settembre(analyst):
    res = analyst.analyze("ModaNova ha diritto a penali per settembre 2026? A quanto ammontano?", True, REGOLE_MODANOVA)
    testo = res["sintesi"].replace(".", "")
    assert "1700" in testo or "1 700" in testo
    assert any(a["kind"] == "chart" for a in res["artifacts"])


def test_luglio_nessuna_penale(analyst):
    res = analyst.analyze("ModaNova ha diritto a penali per luglio 2026?", False, REGOLE_MODANOVA)
    assert "nessuna penale" in res["sintesi"].lower() or "non" in res["sintesi"].lower()


def test_vettore_con_piu_danni(analyst):
    res = analyst.analyze("Qual è il tasso di danni per vettore nel 2026? Fammi un grafico.", True)
    assert "VLX" in res["sintesi"] or "VeloceExpress" in res["sintesi"]
    assert res["artifacts"]


def test_cache_parafrasi_con_embedding_reali():
    """Le coppie di valutazione_cache.py con il modello di embedding vero, alla soglia del servizio.

    Zero risposte improprie su entrambi gli insiemi; richiamo minimo sull'insieme di messa a punto e su quello di controllo.
    """
    from cleaning import pulisci_dataset
    from dataset import load_raw
    from main import entita_della_cache
    from valutazione_cache import DIVERSE, DIVERSE_CONTROLLO, PARAFRASI, PARAFRASI_CONTROLLO, conteggi, valuta

    s = Settings.from_env()
    assert s.embedding_id, "EMBEDDING_PROVIDER / EMBEDDING_MODEL non configurati"
    from langchain.embeddings import init_embeddings

    batch = init_embeddings(s.embedding_id).embed_documents
    entita = entita_della_cache(pulisci_dataset(load_raw(s.csv_path))[0])
    for parafrasi, diverse, richiamo_minimo in [(PARAFRASI, DIVERSE, 0.9), (PARAFRASI_CONTROLLO, DIVERSE_CONTROLLO, 0.7)]:
        riconosciute, improprie = conteggi(valuta(parafrasi, batch, entita), valuta(diverse, batch, entita), s.cache_soglia, True)
        assert improprie == 0
        assert riconosciute / len(parafrasi) >= richiamo_minimo
