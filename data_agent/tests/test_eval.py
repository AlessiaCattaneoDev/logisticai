"""Valutazioni con LLM REALE (costano qualche centesimo). Escluse di default.

Esecuzione:  .venv/bin/python -m pytest -m eval -v   (richiede il .env compilato)
Misurano se l'agente, con il modello configurato, arriva ai numeri attesi dal dataset.
"""
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

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
