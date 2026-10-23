"""Caricamento e validazione del CSV grezzo.

Il CSV si legge tutto come testo, così le anomalie restano visibili alla pulizia. All'avvio
`carica_dataset` controlla che ci siano le colonne attese e che i valori siano del tipo atteso:
se il file è sbagliato (colonne mancanti, formato cambiato) il servizio NON parte e dice perché,
invece di produrre analisi sbagliate. Le anomalie piccole e note diventano avvisi.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import pandas as pd

from cleaning import parse_dates, parse_number

Tipo = Literal["testo", "data", "numero", "intero", "booleano"]

SCHEMA: dict[str, Tipo] = {
    "id_spedizione": "testo", "cliente": "testo", "hub_partenza": "testo",
    "data_ritiro": "data", "data_consegna_prevista": "data", "data_consegna_effettiva": "data",
    "regione_destinazione": "testo", "area_destinazione": "testo", "tipo_destinatario": "testo",
    "servizio": "testo", "vettore": "testo", "num_colli": "intero", "peso_kg": "numero",
    "valore_merce_eur": "numero", "temperatura_controllata": "booleano", "stato": "testo",
    "tentativi_consegna": "intero", "motivo_ritardo": "testo", "danno": "booleano",
    "riserva_alla_consegna": "booleano", "importo_reclamo_eur": "numero", "esito_reclamo": "testo",
    "costo_trasporto_eur": "numero", "ricavo_eur": "numero",
}
# Colonne senza le quali una riga non è analizzabile: possono mancare solo in pochi casi.
OBBLIGATORIE = ["id_spedizione", "cliente", "hub_partenza", "data_ritiro", "data_consegna_prevista", "servizio", "stato"]
BOOLEANI = {"true", "false", "1", "0", "sì", "si", "no"}
# Oltre questa quota di valori non interpretabili la colonna è considerata del tipo sbagliato.
MAX_NON_VALIDI = 0.05
ESEMPI = 3


class DatasetNonValido(ValueError):
    pass


@dataclass
class ReportValidazione:
    righe: int = 0
    errori: list[str] = field(default_factory=list)
    avvisi: list[str] = field(default_factory=list)

    @property
    def valido(self) -> bool:
        return not self.errori

    def as_dict(self) -> dict:
        return {"valido": self.valido, "righe": self.righe, "errori": list(self.errori), "avvisi": list(self.avvisi)}


def load_raw(path: Path | str) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def _non_validi(valori: pd.Series, tipo: Tipo) -> pd.Series:
    """Valori NON vuoti che non si possono interpretare come `tipo` (con le stesse regole della pulizia)."""
    if tipo == "data":
        return valori[parse_dates(valori)[0].isna()]
    if tipo == "numero":
        return valori[valori.map(parse_number).isna()]
    if tipo == "intero":
        return valori[pd.to_numeric(valori, errors="coerce").isna()]
    if tipo == "booleano":
        return valori[~valori.str.lower().isin(BOOLEANI)]
    return valori.iloc[0:0]


def valida_dataset(df: pd.DataFrame) -> ReportValidazione:
    report = ReportValidazione(righe=len(df))
    if df.empty:
        report.errori.append("il file non contiene righe")
    mancanti = [c for c in SCHEMA if c not in df.columns]
    if mancanti:
        report.errori.append(f"colonne mancanti: {', '.join(mancanti)}")
    extra = [c for c in df.columns if c not in SCHEMA]
    if extra:
        report.avvisi.append(f"colonne non previste (ignorate): {', '.join(map(str, extra))}")
    if df.empty:
        return report

    for col, tipo in SCHEMA.items():
        if col not in df.columns:
            continue
        testo = df[col].astype(str).str.strip()
        pieni = testo[testo != ""]
        vuoti = len(testo) - len(pieni)
        if col in OBBLIGATORIE and vuoti:
            msg = f"{col}: {vuoti} valori vuoti su {len(testo)}"
            (report.errori if vuoti / len(testo) > MAX_NON_VALIDI else report.avvisi).append(msg)
        sbagliati = _non_validi(pieni, tipo)
        if len(sbagliati):
            esempi = ", ".join(repr(v) for v in sbagliati.unique()[:ESEMPI])
            msg = f"{col}: {len(sbagliati)} valori non interpretabili come {tipo} su {len(pieni)} (es. {esempi})"
            (report.errori if len(sbagliati) / len(pieni) > MAX_NON_VALIDI else report.avvisi).append(msg)
    return report


def carica_dataset(path: Path | str) -> tuple[pd.DataFrame, ReportValidazione]:
    """CSV grezzo + report di validazione. Solleva DatasetNonValido con TUTTI i problemi bloccanti."""
    path = Path(path)
    try:
        df = load_raw(path)
    except FileNotFoundError:
        raise DatasetNonValido(f"CSV non trovato: {path} (controlla CSV_PATH nel .env)") from None
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as err:
        raise DatasetNonValido(f"CSV non leggibile: {path}: {err}") from None
    report = valida_dataset(df)
    if report.errori:
        raise DatasetNonValido(f"CSV non valido ({path}):\n- " + "\n- ".join(report.errori))
    return df, report
