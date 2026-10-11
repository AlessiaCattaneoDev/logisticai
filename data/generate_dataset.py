"""Generatore riproducibile dello storico spedizioni di Padana Logistics.

Uso:  python generate_dataset.py            (seed 42 -> spedizioni.csv + anomalie_manifest.json)

1. generate_clean()    -> DataFrame tipizzato e coerente con business_rules.json,
                          con le "storie" di PROGETTO.md §5.3 inserite di proposito.
2. inject_anomalies()  -> versione "sporca" (stringhe) con le anomalie di PROGETTO.md §5.2
                          e un manifest che le documenta.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RULES = json.loads((HERE / "business_rules.json").read_text(encoding="utf-8"))
CSV_PATH = HERE / "spedizioni.csv"
MANIFEST_PATH = HERE / "anomalie_manifest.json"

START = pd.Timestamp(RULES["periodo_dati"]["inizio"])
END = pd.Timestamp(RULES["periodo_dati"]["fine"])
N_ROWS = 12_000
SEED = 42

HOLIDAYS = [
    "2024-11-01", "2024-12-25", "2024-12-26",
    "2025-01-01", "2025-01-06", "2025-04-21", "2025-04-25", "2025-05-01", "2025-06-02",
    "2025-08-15", "2025-12-08", "2025-12-25", "2025-12-26",
    "2026-01-01", "2026-01-06", "2026-04-06", "2026-05-01", "2026-06-02",
    "2026-12-08", "2026-12-25",
]
_HOL = np.array(HOLIDAYS, dtype="datetime64[D]")

COLUMNS = [
    "id_spedizione", "cliente", "hub_partenza", "data_ritiro", "data_consegna_prevista",
    "data_consegna_effettiva", "regione_destinazione", "area_destinazione", "tipo_destinatario",
    "servizio", "vettore", "num_colli", "peso_kg", "valore_merce_eur", "temperatura_controllata",
    "stato", "tentativi_consegna", "motivo_ritardo", "danno", "riserva_alla_consegna",
    "importo_reclamo_eur", "esito_reclamo", "costo_trasporto_eur", "ricavo_eur",
]

# --- Profili dei clienti (parametri di generazione, non regole contrattuali) ------------

CLIENT_SHARE = {
    "ModaNova": 0.24, "TechPoint": 0.11, "BellaPelle Cosmetici": 0.09, "CasaViva Arredo": 0.05,
    "FarmaSalus": 0.08, "GustoItaliano": 0.08, "BrianzaUtensili": 0.09, "KidsPlanet": 0.08,
    "SportLab": 0.08, "LibriMondo": 0.10,
}
DEFAULT_AREA_MIX = {"Nord": 0.50, "Centro": 0.22, "Sud": 0.20, "Isole": 0.08}
AREA_MIX = {
    "ModaNova": {"Nord": 0.45, "Centro": 0.22, "Sud": 0.23, "Isole": 0.10},
    "BellaPelle Cosmetici": {"Nord": 0.35, "Centro": 0.20, "Sud": 0.35, "Isole": 0.10},
    "BrianzaUtensili": {"Nord": 0.70, "Centro": 0.18, "Sud": 0.10, "Isole": 0.02},
    "FarmaSalus": {"Nord": 0.50, "Centro": 0.25, "Sud": 0.18, "Isole": 0.07},
}
REGION_WEIGHTS = {
    "Nord": {"Lombardia": 0.35, "Piemonte": 0.12, "Veneto": 0.17, "Emilia-Romagna": 0.16, "Liguria": 0.06,
             "Friuli-Venezia Giulia": 0.05, "Trentino-Alto Adige": 0.06, "Valle d'Aosta": 0.03},
    "Centro": {"Toscana": 0.30, "Lazio": 0.40, "Marche": 0.12, "Umbria": 0.08, "Abruzzo": 0.10},
    "Sud": {"Campania": 0.38, "Puglia": 0.30, "Calabria": 0.17, "Basilicata": 0.07, "Molise": 0.08},
    "Isole": {"Sicilia": 0.70, "Sardegna": 0.30},
}
B2C_SHARE = {
    "ModaNova": 1.0, "TechPoint": 0.6, "BellaPelle Cosmetici": 0.7, "CasaViva Arredo": 0.85,
    "FarmaSalus": 0.15, "GustoItaliano": 0.3, "BrianzaUtensili": 0.0, "KidsPlanet": 0.7,
    "SportLab": 0.6, "LibriMondo": 0.5,
}
EXPRESS_SHARE = {"ModaNova": 0.30, "TechPoint": 0.35, "FarmaSalus": 0.50, "BellaPelle Cosmetici": 0.20,
                 "BrianzaUtensili": 0.25}
WEIGHT_PER_PARCEL_KG = {
    "ModaNova": (0.5, 3), "TechPoint": (1, 15), "BellaPelle Cosmetici": (0.3, 2), "CasaViva Arredo": (15, 80),
    "FarmaSalus": (0.5, 5), "GustoItaliano": (2, 20), "BrianzaUtensili": (2, 25), "KidsPlanet": (1, 8),
    "SportLab": (1, 10), "LibriMondo": (0.5, 6),
}
GOODS_VALUE_EUR = {
    "ModaNova": (30, 250), "TechPoint": (80, 1500), "BellaPelle Cosmetici": (15, 120),
    "CasaViva Arredo": (150, 1500), "FarmaSalus": (40, 400), "GustoItaliano": (20, 200),
    "BrianzaUtensili": (50, 800), "KidsPlanet": (20, 150), "SportLab": (30, 300), "LibriMondo": (10, 80),
}
PRICE_MULTIPLIER = {"ModaNova": 0.95, "TechPoint": 1.05, "FarmaSalus": 1.35, "BrianzaUtensili": 1.05,
                    "LibriMondo": 0.90}
CARRIER_COST_MULTIPLIER = {"PAD": 0.90, "TRS": 1.00, "VLX": 1.05, "SCG": 1.05, "ISX": 1.10}
PRICE_BASE = {"Standard 24/48h": 6.2, "Express 24h": 8.9, "Isole": 12.5}
COST_BASE = {"Standard 24/48h": 4.6, "Express 24h": 6.8, "Isole": 9.8}

# Puntualità imputabile "forzata" per ModaNova (storia 2): in tutti gli altri mesi 97,5%.
MODANOVA_OTD_TARGET = {"2026-07": 0.955, "2026-08": 0.936, "2026-09": 0.928}
MODANOVA_OTD_DEFAULT = 0.975

OUTCOMES = ["ontime", "Smarrita", "Meteo avverso", "Destinatario assente", "Indirizzo errato",
            "Traffico", "Mezzo guasto", "Ritardo subvettore", "Picco volumi hub"]
EXCLUDED = {m for m, v in RULES["motivi_ritardo"].items() if not v["imputabile_a_padana"]}
IMPUTABLE = {"Smarrita", "Traffico", "Mezzo guasto", "Ritardo subvettore", "Picco volumi hub"}


# --- Utilità date ----------------------------------------------------------------------

def _busday(dates: np.ndarray, offset) -> np.ndarray:
    return np.busday_offset(dates.astype("datetime64[D]"), offset, roll="forward", holidays=_HOL)


def _season(day: pd.Timestamp) -> float:
    if day.month == 8:
        return 0.6
    if day.month == 11:
        return 1.3
    if day.month == 12:
        return 1.45 if day.day <= 23 else 0.5
    return 1.0


def _client_modifier(client: str, day: pd.Timestamp) -> float:
    years = (day - START).days / 365.25
    if client == "TechPoint":
        return 1 + 0.6 * years
    if client == "KidsPlanet" and day.month in (11, 12):
        return 2.5
    if client == "GustoItaliano":
        return {11: 1.4, 12: 2.0}.get(day.month, 1.0)
    if client == "SportLab":
        return {6: 1.6, 7: 1.6, 12: 0.6}.get(day.month, 1.0)
    return 1.0


# --- Generazione pulita ---------------------------------------------------------------

def generate_clean(seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    clients = list(CLIENT_SHARE)
    days = pd.bdate_range(START, END, freq="C", holidays=HOLIDAYS)

    # 1. Giorno di ritiro e cliente: campionamento proporzionale a stagionalità e quota cliente.
    weights = np.array([[_season(d) * CLIENT_SHARE[c] * _client_modifier(c, d) for c in clients] for d in days])
    flat = weights.ravel() / weights.sum()
    picks = rng.choice(flat.size, size=N_ROWS, p=flat)
    day_idx, client_idx = np.divmod(picks, len(clients))
    df = pd.DataFrame({"cliente": np.array(clients)[client_idx]})
    minutes = rng.integers(8 * 60, 19 * 60, size=N_ROWS)
    df["data_ritiro"] = days[day_idx] + pd.to_timedelta(minutes, unit="m")
    df["hub_partenza"] = df["cliente"].map({c: v["hub"] for c, v in RULES["clienti"].items()})

    # 2. Destinazione, tipo destinatario, servizio, vettore.
    areas = []
    for c in df["cliente"]:
        mix = AREA_MIX.get(c, DEFAULT_AREA_MIX)
        areas.append(rng.choice(list(mix), p=list(mix.values())))
    df["area_destinazione"] = areas
    df["regione_destinazione"] = [
        rng.choice(list(REGION_WEIGHTS[a]), p=list(REGION_WEIGHTS[a].values())) for a in df["area_destinazione"]
    ]
    df["tipo_destinatario"] = np.where(rng.random(N_ROWS) < df["cliente"].map(B2C_SHARE), "B2C", "B2B")
    express = rng.random(N_ROWS) < df["cliente"].map(lambda c: EXPRESS_SHARE.get(c, 0.15))
    # Da contratto ModaNova usa l'Express solo verso Nord e Centro.
    express &= ~((df["cliente"] == "ModaNova") & (df["area_destinazione"] == "Sud"))
    df["servizio"] = np.select(
        [df["cliente"] == "CasaViva Arredo", df["area_destinazione"] == "Isole", express],
        ["Voluminoso", "Isole", "Express 24h"],
        default="Standard 24/48h",
    )
    df["vettore"] = [RULES["assegnazione_vettori"][s][a] for s, a in zip(df["servizio"], df["area_destinazione"])]

    # 3. Data di consegna prevista dai tempi di resa (giorni lavorativi, orario limite 17:00).
    pickup_day = df["data_ritiro"].dt.normalize().to_numpy()
    after_cutoff = (df["data_ritiro"].dt.hour >= 17).to_numpy().astype(int)
    base = _busday(pickup_day, after_cutoff)
    resa = [RULES["servizi"][s]["tempi_resa_giorni_lavorativi"][a] for s, a in zip(df["servizio"], df["area_destinazione"])]
    df["data_consegna_prevista"] = pd.to_datetime(_busday(base, np.array(resa)))

    # 4. Esito della consegna.
    df["esito"] = _sample_outcomes(df, rng)
    _force_modanova_quota(df, rng)

    # 5. Date effettive, stato, tentativi.
    _apply_delivery(df, rng)

    # 6. Colli, peso, valore, danni, reclami, economics.
    _apply_goods_and_claims(df, rng)
    _apply_economics(df)

    df = df.sort_values("data_ritiro", kind="stable").reset_index(drop=True)
    seq = df.groupby(df["data_ritiro"].dt.year).cumcount() + 1
    df["id_spedizione"] = "SP-" + df["data_ritiro"].dt.year.astype(str) + "-" + seq.map("{:06d}".format)
    df["motivo_ritardo"] = df["esito"].where(~df["esito"].isin(["ontime", "Smarrita"]), None)
    df.loc[df["stato"] == "In transito", "motivo_ritardo"] = None
    return df[COLUMNS]


def _sample_outcomes(df: pd.DataFrame, rng: np.random.Generator) -> np.ndarray:
    n = len(df)
    prevista = df["data_consegna_prevista"]
    month, day = prevista.dt.month, prevista.dt.day
    winter = month.isin([12, 1, 2])
    b2c = df["tipo_destinatario"] == "B2C"
    sms = df["data_ritiro"] >= RULES["giacenze"]["preavviso_sms"]["dal"]
    peak = (df["hub_partenza"] == "HUB-VR") & (((month == 11) & (day >= 15)) | ((month == 12) & (day <= 23)))
    scg_express = (df["vettore"] == "SCG") & (df["servizio"] == "Express 24h")

    p = pd.DataFrame(0.0, index=df.index, columns=OUTCOMES)
    p["Smarrita"] = 0.0015
    p["Meteo avverso"] = np.where(winter, 0.02, 0.008)
    p["Destinatario assente"] = np.where(b2c, np.where(sms, 0.033, 0.06), 0.008)
    p["Indirizzo errato"] = 0.008
    p["Traffico"] = np.where(df["vettore"] == "PAD", 0.009, 0.006)
    p["Mezzo guasto"] = 0.003
    p["Ritardo subvettore"] = np.where(df["vettore"] == "PAD", 0.0, 0.003)
    p["Ritardo subvettore"] += np.where(scg_express, 0.30, 0.0) + np.where(df["vettore"] == "ISX", 0.03, 0.0)
    p["Picco volumi hub"] = np.where(peak, 0.10, 0.0)
    p["ontime"] = 1 - p.drop(columns="ontime").sum(axis=1)

    cum = p.to_numpy().cumsum(axis=1)
    draws = rng.random(n)[:, None]
    return np.array(OUTCOMES)[(draws > cum).sum(axis=1)]


def _force_modanova_quota(df: pd.DataFrame, rng: np.random.Generator) -> None:
    moda = (df["cliente"] == "ModaNova") & (df["data_consegna_prevista"] <= END)
    ym = df["data_consegna_prevista"].dt.strftime("%Y-%m")
    for month in sorted(ym[moda].unique()):
        target = MODANOVA_OTD_TARGET.get(month, MODANOVA_OTD_DEFAULT)
        eligible = df.index[moda & (ym == month) & ~df["esito"].isin(EXCLUDED)]
        df.loc[eligible, "esito"] = "ontime"
        k = round(len(eligible) * (1 - target))
        late = rng.choice(eligible, size=k, replace=False)
        if month in ("2026-08", "2026-09"):
            reasons, probs = ["Ritardo subvettore", "Traffico", "Mezzo guasto", "Picco volumi hub"], [0.5, 0.2, 0.2, 0.1]
        else:
            reasons, probs = ["Traffico", "Mezzo guasto", "Ritardo subvettore"], [0.5, 0.25, 0.25]
        df.loc[late, "esito"] = rng.choice(reasons, size=k, p=probs)


def _apply_delivery(df: pd.DataFrame, rng: np.random.Generator) -> None:
    n = len(df)
    prevista = df["data_consegna_prevista"].to_numpy().astype("datetime64[D]")
    pickup_day = df["data_ritiro"].dt.normalize().to_numpy().astype("datetime64[D]")
    esito = df["esito"].to_numpy()

    delay = np.zeros(n, dtype=int)
    late_std = np.isin(esito, ["Traffico", "Mezzo guasto", "Ritardo subvettore", "Picco volumi hub", "Meteo avverso"])
    delay[late_std] = rng.choice([1, 2, 3], size=late_std.sum(), p=[0.6, 0.3, 0.1])
    dest = esito == "Destinatario assente"
    giacenza = dest & (rng.random(n) < 0.13)
    delay[dest] = rng.choice([1, 2], size=dest.sum())
    delay[giacenza] = rng.integers(3, 9, size=giacenza.sum())
    indirizzo = esito == "Indirizzo errato"
    delay[indirizzo] = rng.choice([2, 3, 4], size=indirizzo.sum())

    # Puntuali: a volte un giorno prima del previsto, mai il giorno del ritiro.
    early = (esito == "ontime") & (rng.random(n) < 0.15)
    early_day = _busday(prevista, -1)
    early &= early_day > pickup_day
    delivery_day = np.where(early, early_day, _busday(prevista, delay))
    delivery_time = rng.integers(9 * 60, 18 * 60, size=n)
    effettiva = pd.Series(pd.to_datetime(delivery_day) + pd.to_timedelta(delivery_time, unit="m"), index=df.index)

    reso = (dest & ~giacenza & (rng.random(n) < 0.14)) | (indirizzo & (rng.random(n) < 0.2))
    stato = np.full(n, "Consegnata", dtype=object)
    stato[reso] = "Reso al mittente"
    stato[esito == "Smarrita"] = "Smarrita"
    oltre_fine = (effettiva > END + pd.Timedelta(days=1)).to_numpy()
    stato[oltre_fine & (dest | indirizzo)] = "In giacenza"
    stato[oltre_fine & ~(dest | indirizzo)] = "In transito"
    stato[df["data_consegna_prevista"].to_numpy() > np.datetime64(END)] = "In transito"

    df["stato"] = stato
    df["data_consegna_effettiva"] = effettiva.where(stato == "Consegnata", pd.NaT)
    df["tentativi_consegna"] = np.where(dest | indirizzo, 2, 1)
    df.loc[df["stato"] == "In transito", "tentativi_consegna"] = 0
    df.loc[df["stato"] == "Smarrita", "tentativi_consegna"] = 0


def _apply_goods_and_claims(df: pd.DataFrame, rng: np.random.Generator) -> None:
    n = len(df)
    voluminoso = df["cliente"] == "CasaViva Arredo"
    colli = rng.choice([1, 2, 3, 4, 5], size=n, p=[0.7, 0.2, 0.06, 0.03, 0.01])
    colli = np.where(voluminoso, rng.choice([1, 2, 3], size=n, p=[0.6, 0.3, 0.1]), colli)
    low = df["cliente"].map(lambda c: WEIGHT_PER_PARCEL_KG[c][0]).to_numpy()
    high = df["cliente"].map(lambda c: WEIGHT_PER_PARCEL_KG[c][1]).to_numpy()
    df["num_colli"] = colli
    df["peso_kg"] = np.round(rng.uniform(low, high) * colli, 1)
    vlow = df["cliente"].map(lambda c: GOODS_VALUE_EUR[c][0]).to_numpy()
    vhigh = df["cliente"].map(lambda c: GOODS_VALUE_EUR[c][1]).to_numpy()
    df["valore_merce_eur"] = np.round(np.exp(rng.uniform(np.log(vlow), np.log(vhigh))) * colli, 2)
    df["temperatura_controllata"] = (df["cliente"] == "FarmaSalus") & (rng.random(n) < 0.6)

    p_danno = np.where(df["vettore"] == "VLX", np.where(df["data_ritiro"] >= "2026-01-01", 0.03, 0.012), 0.0025)
    danno = (df["stato"] == "Consegnata").to_numpy() & (rng.random(n) < p_danno)
    riserva = danno & (rng.random(n) < 0.75)
    df["danno"] = danno
    df["riserva_alla_consegna"] = pd.Series(np.where(danno, riserva, None), index=df.index, dtype="object")
    importo = np.round(df["valore_merce_eur"].to_numpy() * rng.uniform(0.3, 1.0, size=n), 2)
    df["importo_reclamo_eur"] = np.where(danno, importo, 0.0)

    accolto = np.where(riserva, rng.random(n) < 0.8, rng.random(n) < 0.25)
    esito = np.where(accolto, "Accolto", "Respinto").astype(object)
    recente = (df["data_ritiro"] > END - pd.Timedelta(days=20)).to_numpy()
    esito[recente] = "In corso"
    df["esito_reclamo"] = np.where(danno, esito, None)


def _apply_economics(df: pd.DataFrame) -> None:
    peso, colli = df["peso_kg"], df["num_colli"]
    extra_kg = (peso - 3).clip(lower=0)
    voluminoso = df["servizio"] == "Voluminoso"
    price = df["servizio"].map(PRICE_BASE).fillna(0) + 0.28 * extra_kg
    price = price.where(~voluminoso, 38 + 0.45 * peso)
    price = price * df["cliente"].map(lambda c: PRICE_MULTIPLIER.get(c, 1.0)) * (1 + 0.15 * (colli - 1))
    cost = df["servizio"].map(COST_BASE).fillna(0) + 0.20 * extra_kg
    cost = cost.where(~voluminoso, 44 + 0.75 * peso)
    cost = cost * df["vettore"].map(CARRIER_COST_MULTIPLIER) * (1 + 0.12 * (colli - 1))
    cost = cost + np.where(df["temperatura_controllata"], 1.2, 0.0)
    df["ricavo_eur"] = price.round(2)
    df["costo_trasporto_eur"] = cost.round(2)


# --- Serializzazione e anomalie -------------------------------------------------------

def to_csv_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Converte in stringhe con i formati "canonici" del CSV. Idempotente sui frame già testuali."""
    out = pd.DataFrame(index=df.index)
    for col in df.columns:
        s = df[col]
        if pd.api.types.is_datetime64_any_dtype(s):
            fmt = "%Y-%m-%d" if col == "data_consegna_prevista" else "%Y-%m-%d %H:%M"
            out[col] = s.dt.strftime(fmt).fillna("")
        elif pd.api.types.is_bool_dtype(s):
            out[col] = s.map({True: "True", False: "False"})
        elif pd.api.types.is_float_dtype(s):
            decimals = 1 if col == "peso_kg" else 2
            out[col] = s.map(lambda v: "" if pd.isna(v) else f"{v:.{decimals}f}")
        else:
            out[col] = s.map(lambda v: "" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v))
    return out


MESI_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
CLIENT_VARIANTS = {
    "ModaNova": ["modanova", "Moda Nova", "MODANOVA "], "TechPoint": ["Techpoint", "TECHPOINT", "Tech Point"],
    "BellaPelle Cosmetici": ["Bellapelle cosmetici", "BellaPelle"], "CasaViva Arredo": ["Casaviva Arredo", "CASAVIVA"],
    "FarmaSalus": ["Farmasalus", "Farma Salus "], "GustoItaliano": ["Gusto Italiano", "gustoitaliano"],
    "BrianzaUtensili": ["Brianza Utensili", "brianzautensili"], "KidsPlanet": ["Kids Planet", "kidsplanet"],
    "SportLab": ["Sportlab", "SPORTLAB"], "LibriMondo": ["Libri Mondo", "librimondo "],
}
HUB_VARIANTS = {"HUB-PC": ["Piacenza", "PC", "hub-pc"], "HUB-VR": ["Verona", "VR", "hub-vr"]}
SERVICE_VARIANTS = {
    "Standard 24/48h": ["standard", "STANDARD 24/48H", "Standard 24-48h"],
    "Express 24h": ["express 24h", "Express", "EXPRESS"],
    "Isole": ["isole", "ISOLE"], "Voluminoso": ["voluminoso", "VOLUMINOSO"],
}

# Quota di righe originali coinvolte per tipo (righe distinte tra un tipo e l'altro).
ANOMALY_RATES = {
    "duplicati_esatti": 0.015, "quasi_duplicati": 0.005, "valori_mancanti": 0.025, "date_formati_misti": 0.02,
    "categorie_incoerenti": 0.02, "numeri_formato_testo": 0.007, "fuori_range": 0.005, "incoerenze_logiche": 0.005,
}
ANOMALY_DESCRIPTIONS = {
    "duplicati_esatti": "Riga identica ripetuta",
    "quasi_duplicati": "Stessa spedizione con spazi o maiuscole diverse nell'id e nel cliente",
    "valori_mancanti": "Celle vuote in vettore, peso_kg, ricavo_eur o regione_destinazione",
    "date_formati_misti": "Date in formato gg/mm/aaaa, mm-gg-aaaa o '14 mar 2026'",
    "categorie_incoerenti": "Varianti di nome per cliente, hub o servizio (maiuscole, spazi, abbreviazioni)",
    "numeri_formato_testo": "Numeri in formato italiano o con unità/valuta ('1.250,50', '€ 8,90', '7,4 kg')",
    "fuori_range": "Peso negativo o 9999 kg, ricavo zero, costo negativo",
    "incoerenze_logiche": "Consegna prima del ritiro, 'Consegnata' senza data, date future, reclamo senza danno",
}


def _fmt_date_variant(value: str, variant: int) -> str:
    if not value:
        return value
    ts = pd.Timestamp(value)
    if variant == 0:
        return ts.strftime("%d/%m/%Y %H:%M")
    if variant == 1:
        return ts.strftime("%m-%d-%Y %H:%M")
    return f"{ts.day} {MESI_IT[ts.month - 1]} {ts.year}"


def _it_number(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def inject_anomalies(clean: pd.DataFrame, seed: int = SEED) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(seed + 1)
    df = to_csv_frame(clean).reset_index(drop=True)
    n = len(df)
    counts = {k: round(n * r) for k, r in ANOMALY_RATES.items()}
    order = rng.permutation(n)
    chosen, cursor = {}, 0
    for kind, k in counts.items():
        chosen[kind] = np.sort(order[cursor:cursor + k])
        cursor += k
    examples: dict[str, list[str]] = {k: [] for k in counts}

    def note(kind: str, i: int) -> None:
        if len(examples[kind]) < 5:
            examples[kind].append(df.at[i, "id_spedizione"].strip())

    for i in chosen["valori_mancanti"]:
        note("valori_mancanti", i)
        df.at[i, rng.choice(["vettore", "peso_kg", "ricavo_eur", "regione_destinazione"])] = ""

    for i in chosen["date_formati_misti"]:
        note("date_formati_misti", i)
        variant = int(rng.integers(0, 3))
        df.at[i, "data_ritiro"] = _fmt_date_variant(df.at[i, "data_ritiro"], variant)
        df.at[i, "data_consegna_effettiva"] = _fmt_date_variant(df.at[i, "data_consegna_effettiva"], variant)

    for i in chosen["categorie_incoerenti"]:
        note("categorie_incoerenti", i)
        col = rng.choice(["cliente", "hub_partenza", "servizio"], p=[0.5, 0.25, 0.25])
        variants = {"cliente": CLIENT_VARIANTS, "hub_partenza": HUB_VARIANTS, "servizio": SERVICE_VARIANTS}[col]
        df.at[i, col] = rng.choice(variants[df.at[i, col]])

    for i in chosen["numeri_formato_testo"]:
        note("numeri_formato_testo", i)
        col = rng.choice(["ricavo_eur", "valore_merce_eur", "peso_kg"])
        value = float(df.at[i, col])
        if col == "ricavo_eur":
            df.at[i, col] = "€ " + _it_number(value)
        elif col == "valore_merce_eur":
            df.at[i, col] = _it_number(value)
        else:
            df.at[i, col] = f"{value:.1f}".replace(".", ",") + " kg"

    for i in chosen["fuori_range"]:
        note("fuori_range", i)
        kind = int(rng.integers(0, 4))
        if kind == 0:
            df.at[i, "peso_kg"] = f"-{df.at[i, 'peso_kg']}"
        elif kind == 1:
            df.at[i, "peso_kg"] = "9999.0"
        elif kind == 2:
            df.at[i, "ricavo_eur"] = "0.00"
        else:
            df.at[i, "costo_trasporto_eur"] = f"-{df.at[i, 'costo_trasporto_eur']}"

    for i in chosen["incoerenze_logiche"]:
        note("incoerenze_logiche", i)
        kind = int(rng.integers(0, 4))
        if kind == 0 and df.at[i, "data_consegna_effettiva"]:
            ritiro = pd.Timestamp(df.at[i, "data_ritiro"])
            df.at[i, "data_consegna_effettiva"] = (ritiro - pd.Timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
        elif kind == 1:
            df.at[i, "stato"] = "Consegnata"
            df.at[i, "data_consegna_effettiva"] = ""
        elif kind == 2:
            ritiro = pd.Timestamp(df.at[i, "data_ritiro"]) + pd.DateOffset(years=1)
            df.at[i, "data_ritiro"] = ritiro.strftime("%Y-%m-%d %H:%M")
        else:
            df.at[i, "danno"] = "False"
            df.at[i, "importo_reclamo_eur"] = f"{rng.uniform(20, 300):.2f}"

    # Duplicati: inseriti subito dopo la riga originale.
    extra = []
    for i in chosen["duplicati_esatti"]:
        note("duplicati_esatti", i)
        extra.append((i + 0.5, df.loc[i].copy()))
    for i in chosen["quasi_duplicati"]:
        note("quasi_duplicati", i)
        row = df.loc[i].copy()
        row["id_spedizione"] = row["id_spedizione"] + " " if rng.random() < 0.5 else row["id_spedizione"].lower()
        row["cliente"] = row["cliente"].upper()
        extra.append((i + 0.6, row))
    positions = pd.Series(np.arange(n, dtype=float))
    if extra:
        dup = pd.DataFrame([r for _, r in extra])
        df = pd.concat([df, dup], ignore_index=True)
        positions = pd.concat([positions, pd.Series([p for p, _ in extra])], ignore_index=True)
    df = df.iloc[np.argsort(positions.to_numpy(), kind="stable")].reset_index(drop=True)

    manifest = {
        "seed": seed,
        "righe_pulite": n,
        "righe_csv": len(df),
        "righe_con_anomalie": int(sum(counts.values())),
        "anomalie": {
            k: {"descrizione": ANOMALY_DESCRIPTIONS[k], "conteggio": counts[k], "esempi": examples[k]}
            for k in counts
        },
    }
    return df[COLUMNS], manifest


def main() -> None:
    clean = generate_clean(SEED)
    dirty, manifest = inject_anomalies(clean, SEED)
    CSV_PATH.write_text(to_csv_frame(dirty).to_csv(index=False), encoding="utf-8")
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{CSV_PATH.name}: {len(dirty)} righe ({manifest['righe_con_anomalie']} con anomalie)")


if __name__ == "__main__":
    main()
