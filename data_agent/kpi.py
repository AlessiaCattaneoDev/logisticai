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


def come_frazione(valore: float, nome: str) -> float:
    """Accetta soglie scritte come frazione (0.95) o come percentuale (95): restituisce sempre la frazione.

    Dal vivo l'agente ha passato soglia=95 al posto di 0.95, ottenendo una penale enorme: la
    conversione rende quell'errore impossibile.
    """
    # Da 1 in su è una percentuale: "1" significa 1% (nessuno SLA o soglia reale vale 100%).
    frazione = valore / 100 if valore >= 1 else valore
    if not 0 < frazione <= 1:
        raise ValueError(f"{nome}={valore} non valido: usa una frazione (es. 0.95) o una percentuale (es. 95)")
    return frazione


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
    soglia = come_frazione(soglia, "soglia")
    puntualita = come_frazione(puntualita, "puntualita") if puntualita > 1 else puntualita  # 1.0 = tutte puntuali
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


def verifica_sla_mensile(
    d: pd.DataFrame,
    cliente: str,
    mese: str,
    soglia: float,
    penale_per_punto: float,
    tetto: float,
    volume_minimo: int = 0,
    cause_escluse: Iterable[str] = (),
) -> dict:
    """Verifica SLA di un cliente in un mese (AAAA-MM), misurato sulla data di consegna prevista.

    Unico modo affidabile per calcolare una penale: filtro, esclusioni e formula sono sempre gli stessi.
    """
    soglia = come_frazione(soglia, "soglia")
    righe = d[(d["cliente"] == cliente) & (d["mese_previsto"] == mese)]
    if righe.empty:
        raise ValueError(f"nessuna spedizione per {cliente} nel mese {mese}")
    p = calcola_puntualita(righe, cause_escluse=cause_escluse).iloc[0]
    penale = calcola_penale(float(p["puntualita"]), soglia, penale_per_punto, tetto, int(p["spedizioni"]), volume_minimo)
    return {
        "cliente": cliente,
        "mese": mese,
        "spedizioni": int(p["spedizioni"]),
        "escluse": int(p["escluse"]),
        "misurate": int(p["misurate"]),
        "puntuali": int(p["puntuali"]),
        "puntualita": round(float(p["puntualita"]), 4),
        "soglia": soglia,
        **penale,
    }


def valuta_subvettori(
    d: pd.DataFrame,
    soglia_piano: float,
    soglia_sospensione: float,
    mesi_consecutivi: int,
    da_mese: str | None = None,
    a_mese: str | None = None,
) -> pd.DataFrame:
    """Applica la procedura di qualifica: tasso danni mensile per vettore (mese di consegna prevista).

    esito = 'sospensione' se il tasso supera soglia_sospensione per almeno `mesi_consecutivi` mesi di fila,
    'piano di miglioramento' se supera soglia_piano in almeno un mese, altrimenti 'conforme'.
    """
    soglia_piano = come_frazione(soglia_piano, "soglia_piano")
    soglia_sospensione = come_frazione(soglia_sospensione, "soglia_sospensione")
    periodo = d
    if da_mese:
        periodo = periodo[periodo["mese_previsto"] >= da_mese]
    if a_mese:
        periodo = periodo[periodo["mese_previsto"] <= a_mese]
    mensile = tasso_danni(periodo, ["vettore", "mese_previsto"]).sort_values(["vettore", "mese_previsto"])
    righe = []
    for vettore, g in mensile.groupby("vettore"):
        sopra = (g["tasso_danni"] > soglia_sospensione).tolist()
        run = best = 0
        for flag in sopra:
            run = run + 1 if flag else 0
            best = max(best, run)
        mesi_piano = g.loc[g["tasso_danni"] > soglia_piano, "mese_previsto"].tolist()
        esito = "sospensione" if best >= mesi_consecutivi else "piano di miglioramento" if mesi_piano else "conforme"
        righe.append({
            "vettore": vettore,
            "esito": esito,
            "mesi_consecutivi_sopra_sospensione": best,
            "mesi_sopra_soglia_piano": len(mesi_piano),
            "tasso_danni_medio": round(float(g["danni"].sum() / g["consegnate"].sum()), 4),
            "tasso_danni_massimo": round(float(g["tasso_danni"].max()), 4),
            "mese_peggiore": g.loc[g["tasso_danni"].idxmax(), "mese_previsto"],
        })
    ordine = {"sospensione": 0, "piano di miglioramento": 1, "conforme": 2}
    return pd.DataFrame(righe).sort_values(["esito", "tasso_danni_medio"], key=lambda s: s.map(ordine) if s.name == "esito" else -s).reset_index(drop=True)
