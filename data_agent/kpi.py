"""KPI deterministici sullo storico spedizioni (dati già puliti con pulisci_dataset).

Le soglie e le regole contrattuali NON sono qui: l'agente le legge nella knowledge base e
le passa come parametri. Qui c'è solo la definizione di calcolo, testata.
"""
from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

# Valori ammessi nella colonna motivo_ritardo (schema del dataset).
MOTIVI_NOTI = {"Traffico", "Meteo avverso", "Picco volumi hub", "Mezzo guasto",
               "Ritardo subvettore", "Destinatario assente", "Indirizzo errato"}


def _groups(raggruppa_per: str | list[str] | None) -> list[str]:
    if raggruppa_per is None:
        return []
    return [raggruppa_per] if isinstance(raggruppa_per, str) else list(raggruppa_per)


def _aggregate(df: pd.DataFrame, groups: list[str], **aggs) -> pd.DataFrame:
    if groups:
        return df.groupby(groups, dropna=False).agg(**aggs).reset_index()
    return df.assign(_tutto=0).groupby("_tutto").agg(**aggs).reset_index(drop=True)


def calcola_puntualita(
    df: pd.DataFrame,
    cause_escluse: Iterable[str] = (),
    raggruppa_per: str | list[str] | None = None,
) -> pd.DataFrame:
    """Puntualità secondo la definizione SLA.

    - escluse: spedizioni In transito, con motivo in `cause_escluse`, o con data di consegna incerta;
    - puntuale: stato Consegnata e data effettiva <= data prevista;
    - le Smarrite e i ritardi con motivo non escluso contano come non puntuali.
    Colonne: [gruppi..., spedizioni, escluse, misurate, puntuali, puntualita].
    """
    cause = set(cause_escluse)
    sconosciute = cause - MOTIVI_NOTI
    if sconosciute:
        raise ValueError(f"cause_escluse non valide: {sorted(sconosciute)}. Valori ammessi: {sorted(MOTIVI_NOTI)}")
    incerta = df["qualita_dato"].str.contains("data_consegna", na=False)
    esclusa = (df["stato"] == "In transito") | df["motivo_ritardo"].isin(cause) | incerta
    puntuale = (df["stato"] == "Consegnata") & (
        df["data_consegna_effettiva"].dt.normalize() <= df["data_consegna_prevista"]
    )
    work = df.assign(_esclusa=esclusa, _puntuale=puntuale & ~esclusa)
    out = _aggregate(work, _groups(raggruppa_per),
                     spedizioni=("_esclusa", "size"), escluse=("_esclusa", "sum"), puntuali=("_puntuale", "sum"))
    out["misurate"] = out["spedizioni"] - out["escluse"]
    out["puntualita"] = (out["puntuali"] / out["misurate"]).where(out["misurate"] > 0)
    cols = _groups(raggruppa_per) + ["spedizioni", "escluse", "misurate", "puntuali", "puntualita"]
    return out[cols]


def calcola_penale(
    puntualita: float,
    soglia: float,
    penale_per_punto: float,
    tetto: float,
    spedizioni: int,
    volume_minimo: int = 0,
) -> dict:
    """Penale SLA: punti sotto soglia (arrotondati a un decimale) x importo per punto, fino al tetto."""
    if spedizioni < volume_minimo:
        return {"punti_sotto_soglia": 0.0, "penale_eur": 0.0, "applicata": False,
                "nota": f"volume di {spedizioni} spedizioni sotto il minimo di {volume_minimo}: penale non applicabile"}
    punti = max(0.0, round((soglia - puntualita) * 100, 1))
    if punti == 0:
        return {"punti_sotto_soglia": 0.0, "penale_eur": 0.0, "applicata": False, "nota": "puntualità in linea con la soglia"}
    penale = min(punti * penale_per_punto, tetto)
    nota = "tetto mensile raggiunto" if penale == tetto else "penale calcolata sui punti sotto soglia"
    return {"punti_sotto_soglia": punti, "penale_eur": round(float(penale), 2), "applicata": True, "nota": nota}


def tasso_danni(df: pd.DataFrame, raggruppa_per: str | list[str] | None = None) -> pd.DataFrame:
    """Tasso danni = spedizioni con danno / spedizioni consegnate."""
    consegnate = df[df["stato"] == "Consegnata"]
    out = _aggregate(consegnate, _groups(raggruppa_per), consegnate=("danno", "size"), danni=("danno", "sum"))
    out["tasso_danni"] = out["danni"] / out["consegnate"]
    return out


def margine(df: pd.DataFrame, raggruppa_per: str | list[str] | None = None) -> pd.DataFrame:
    """Ricavi, costi di trasporto e margine (valori mancanti ignorati)."""
    out = _aggregate(df, _groups(raggruppa_per), spedizioni=("ricavo_eur", "size"),
                     ricavo_eur=("ricavo_eur", "sum"), costo_eur=("costo_trasporto_eur", "sum"))
    out["margine_eur"] = out["ricavo_eur"] - out["costo_eur"]
    out["margine_pct"] = out["margine_eur"] / out["ricavo_eur"]
    return out
