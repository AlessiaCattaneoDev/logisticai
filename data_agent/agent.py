"""Agente pandas: LangChain create_pandas_dataframe_agent con helper deterministici nel REPL.

Il modello è indipendente dal provider (init_chat_model in main.py). L'agente scrive ed esegue
codice pandas; grafici e tabelle si creano SOLO con crea_grafico / crea_tabella.
"""
from __future__ import annotations

import time
import warnings
from typing import Any
from uuid import UUID

import pandas as pd
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage

with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    from langchain_experimental.agents import create_pandas_dataframe_agent

from artifacts import ArtifactRegistry
from cleaning import pulisci_dataset
from kpi import calcola_penale, calcola_puntualita, margine, tasso_danni

# Il prefix finisce in un SystemMessage letterale (non è un template): graffe singole.
PREFIX = """Sei l'analista dati di Padana Logistics, operatore logistico conto terzi.
Lavori in Python con pandas sul DataFrame `df`: lo storico spedizioni GREZZO (tutte le colonne sono testo, con anomalie).

Regole obbligatorie:
1. Prima di ogni analisi esegui `d = pulisci_dataset()`: restituisce il DataFrame pulito e tipizzato
   (date, numeri, categorie uniformate, duplicati rimossi) con le colonne extra `mese_previsto` (AAAA-MM)
   e `qualita_dato`. Se serve, aggiungi pulizie specifiche alla domanda.
2. Per i KPI usa SEMPRE gli helper, non ricalcolarli a mano:
   - calcola_puntualita(d, cause_escluse=[...], raggruppa_per=None|'col'|['col', ...])
   - calcola_penale(puntualita, soglia, penale_per_punto, tetto, spedizioni, volume_minimo)
   - tasso_danni(d, raggruppa_per=...), margine(d, raggruppa_per=...)
3. Soglie, penali ed esclusioni contrattuali NON sono nei dati: usa solo quelle indicate nella richiesta
   ("Regole da applicare"). Se servono e mancano, dillo invece di inventarle.
4. Grafici e tabelle SOLO con:
   - crea_grafico(df, tipo, x, y, titolo, etichette=..., formato_y=..., linee_riferimento=[{'valore': 0.95, 'etichetta': '...'}], impilato=..., orizzontale=...)
     tipo: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'composed'; formato_y: 'percent' | 'currency_eur' | 'integer' | 'number'
   - crea_tabella(df, titolo, colonne=..., etichette=..., formati={...}, totali=True|False, ordina_per=..., crescente=...)
   Aggrega i dati prima (massimo 500 punti per grafico, 1000 righe per tabella).
   È VIETATO usare matplotlib, seaborn, plotly o qualunque libreria grafica.
5. Non stampare interi DataFrame: stampa solo i numeri che ti servono.
6. Risposta finale in italiano, per un responsabile non tecnico: cosa emerge (con i numeri chiave),
   perché è importante, cosa conviene fare. Cita brevemente la pulizia dati effettuata.
"""


class AnalysisError(RuntimeError):
    pass


class UsageRecorder(BaseCallbackHandler):
    """Registra token e latenza di OGNI chiamata al modello (per i costi in dashboard)."""

    def __init__(self, provider: str, default_model: str) -> None:
        self.provider = provider
        self.default_model = default_model
        self.calls: list[dict] = []
        self._start: dict[UUID, float] = {}

    def on_chat_model_start(self, serialized: Any, messages: Any, *, run_id: UUID, **kw: Any) -> None:
        self._start[run_id] = time.perf_counter()

    def on_llm_end(self, response: Any, *, run_id: UUID, **kw: Any) -> None:
        started = self._start.pop(run_id, time.perf_counter())
        message = getattr(response.generations[0][0], "message", None) if response.generations else None
        usage = getattr(message, "usage_metadata", None) or {}
        model = (message.response_metadata.get("model_name") if isinstance(message, AIMessage) else None) or self.default_model
        self.calls.append({
            "provider": self.provider,
            "model": model,
            "input_tokens": int(usage.get("input_tokens", 0)),
            "output_tokens": int(usage.get("output_tokens", 0)),
            "latency_ms": int((time.perf_counter() - started) * 1000),
        })


class DataAnalyst:
    def __init__(self, df_raw: pd.DataFrame, llm: Any, *, provider: str, model: str = "",
                 max_iterations: int = 8, timeout_s: float = 90.0) -> None:
        self.df_raw = df_raw.copy()
        self.llm = llm
        self.provider = provider
        self.model = model
        self.max_iterations = max_iterations
        self.timeout_s = timeout_s
        self._cleaned: tuple[pd.DataFrame, Any] | None = None

    def _clean(self) -> tuple[pd.DataFrame, Any]:
        if self._cleaned is None:
            self._cleaned = pulisci_dataset(self.df_raw)
        return self._cleaned

    @staticmethod
    def build_input(domanda: str, genera_grafico: bool, regole: str | None = None) -> str:
        parts = [f"Domanda: {domanda}"]
        if regole:
            parts.append(f"Regole da applicare (dalla knowledge base aziendale):\n{regole}")
        if genera_grafico:
            parts.append("Crea almeno un grafico pertinente con crea_grafico (e una tabella se utile).")
        return "\n\n".join(parts)

    def analyze(self, domanda: str, genera_grafico: bool, regole: str | None = None) -> dict:
        registry = ArtifactRegistry()
        pulizia: list[str] = []
        righe = {"n": len(self.df_raw)}

        def pulisci() -> pd.DataFrame:
            df, report = self._clean()
            pulizia[:] = report.come_testo()
            righe["n"] = len(df)
            return df.copy()

        executor = create_pandas_dataframe_agent(
            self.llm,
            self.df_raw.copy(),
            agent_type="tool-calling",
            prefix=PREFIX,
            allow_dangerous_code=True,  # servizio locale, autenticato, CSV in sola lettura
            return_intermediate_steps=True,
            max_iterations=self.max_iterations,
            max_execution_time=self.timeout_s,
            number_of_head_rows=3,
        )
        executor.tools[0].locals.update({
            "pd": pd,
            "pulisci_dataset": pulisci,
            "calcola_puntualita": calcola_puntualita,
            "calcola_penale": calcola_penale,
            "tasso_danni": tasso_danni,
            "margine": margine,
            "crea_grafico": registry.crea_grafico,
            "crea_tabella": registry.crea_tabella,
        })
        usage = UsageRecorder(self.provider, self.model)
        try:
            result = executor.invoke(
                {"input": self.build_input(domanda, genera_grafico, regole)},
                config={"callbacks": [usage]},
            )
        except Exception as err:  # errori del provider o dell'agente
            raise AnalysisError(f"Analisi non riuscita: {err}") from err

        codice = []
        for action, _observation in result.get("intermediate_steps", []):
            tool_input = action.tool_input
            codice.append(tool_input.get("query", str(tool_input)) if isinstance(tool_input, dict) else str(tool_input))
        return {
            "sintesi": str(result.get("output", "")).strip(),
            "artifacts": registry.as_json(),
            "artifacts_riepilogo": registry.riepilogo(),
            "codice_eseguito": codice,
            "pulizia": pulizia,
            "righe_analizzate": righe["n"],
            "usage": usage.calls,
        }
