"""Pipeline deterministica di pulizia dello storico spedizioni.

pulisci_dataset(df) -> (df_pulito, ReportPulizia)

Non conosce le regole contrattuali (quelle stanno nella knowledge base): ricava i valori
canonici dai dati stessi (variante più frequente) e corregge solo errori di formato,
duplicati, valori impossibili e incoerenze logiche. Ogni riga dubbia viene segnalata nella
colonna `qualita_dato`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

CATEGORICAL = ["cliente", "hub_partenza", "servizio", "vettore", "regione_destinazione",
               "area_destinazione", "tipo_destinatario", "stato", "motivo_ritardo", "esito_reclamo"]
DATES = ["data_ritiro", "data_consegna_prevista", "data_consegna_effettiva"]
NUMBERS = ["peso_kg", "valore_merce_eur", "importo_reclamo_eur", "costo_trasporto_eur", "ricavo_eur"]
INTEGERS = ["num_colli", "tentativi_consegna"]
BOOLEANS = ["temperatura_controllata", "danno"]

# Alias che la sola somiglianza tra stringhe non può risolvere (nomi di città per gli hub).
ALIASES = {"hub_partenza": {"piacenza": "HUB-PC", "verona": "HUB-VR"}}
MESI_IT = {m: i + 1 for i, m in enumerate(["gen", "feb", "mar", "apr", "mag", "giu",
                                           "lug", "ago", "set", "ott", "nov", "dic"])}

DESCRIZIONI = {
    "duplicati_rimossi": "Rimosse {n} righe duplicate (stesso id spedizione, anche con spazi o maiuscole diverse)",
    "categorie_normalizzate": "Uniformati {n} valori di categoria scritti in modo diverso (es. 'modanova' → 'ModaNova', 'VR' → 'HUB-VR')",
    "date_convertite": "Convertite {n} date scritte in formati diversi da AAAA-MM-GG",
    "numeri_convertiti": "Convertiti {n} numeri scritti come testo (es. '€ 8,90', '1.250,50', '7,4 kg')",
    "valori_fuori_range": "Annullati {n} valori impossibili (peso negativo o oltre 1.000 kg, ricavo zero, costo negativo)",
    "incoerenze_logiche": "Segnalate {n} incoerenze logiche (consegna prima del ritiro, consegnata senza data, reclamo senza danno)",
    "righe_escluse_date_future": "Escluse {n} righe con data di ritiro successiva alla consegna prevista o nel futuro",
    "valori_mancanti": "Trovati {n} valori mancanti in vettore, peso, ricavo o regione",
    "vettori_ricostruiti": "Ricostruiti {n} vettori mancanti dal servizio e dall'area di destinazione",
}


@dataclass
class ReportPulizia:
    righe_iniziali: int = 0
    righe_finali: int = 0
    conteggi: dict[str, int] = field(default_factory=lambda: {k: 0 for k in DESCRIZIONI})

    def come_testo(self) -> list[str]:
        righe = [DESCRIZIONI[k].format(n=n) for k, n in self.conteggi.items() if n]
        righe.append(f"Righe analizzabili: {self.righe_finali} su {self.righe_iniziali}")
        return righe

    def as_dict(self) -> dict:
        return {"righe_iniziali": self.righe_iniziali, "righe_finali": self.righe_finali,
                "conteggi": dict(self.conteggi), "descrizione": self.come_testo()}


def _is_text(s: pd.Series) -> bool:
    return s.dtype == object or pd.api.types.is_string_dtype(s)


def _blank_to_nan(s: pd.Series) -> pd.Series:
    if _is_text(s):
        s = s.map(lambda v: v.strip() if isinstance(v, str) else v)
        return s.replace("", np.nan)
    return s


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _canonicalize(s: pd.Series, aliases: dict[str, str]) -> tuple[pd.Series, int]:
    values = s.dropna()
    if values.empty:
        return s, 0
    keys = values.map(_key)
    counts = values.groupby([keys, values]).size()
    best = counts.groupby(level=0).idxmax().map(lambda t: t[1])          # chiave -> variante più frequente
    size = counts.groupby(level=0).sum()
    canonical = best[size >= max(2, 0.01 * len(values))]                 # chiavi "vere"

    def resolve(v: str) -> str:
        k = _key(v)
        if k in aliases:
            return aliases[k]
        if k in canonical.index:
            return canonical[k]
        matches = [ck for ck in canonical.index if ck.startswith(k) or k.startswith(ck) or ck.endswith(k)]
        return canonical[matches[0]] if len(matches) == 1 else v

    resolved = s.map(lambda v: resolve(v) if isinstance(v, str) else v)
    changed = int((resolved.fillna("") != s.fillna("")).sum())
    return resolved, changed


_FORMATS = [
    (r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", "%Y-%m-%d %H:%M"),
    (r"^\d{4}-\d{2}-\d{2}$", "%Y-%m-%d"),
    (r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$", "%d/%m/%Y %H:%M"),
    (r"^\d{2}/\d{2}/\d{4}$", "%d/%m/%Y"),
    (r"^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$", "%m-%d-%Y %H:%M"),
    (r"^\d{2}-\d{2}-\d{4}$", "%m-%d-%Y"),
]


def _parse_dates(s: pd.Series) -> tuple[pd.Series, int]:
    if pd.api.types.is_datetime64_any_dtype(s):
        return s, 0
    s = _blank_to_nan(s)
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    converted = 0
    for i, (pattern, fmt) in enumerate(_FORMATS):
        mask = s.str.match(pattern, na=False) & out.isna()
        if mask.any():
            out[mask] = pd.to_datetime(s[mask], format=fmt, errors="coerce")
            if i >= 2:
                converted += int(mask.sum())
    italian = s.str.match(r"^\d{1,2} [a-z]{3} \d{4}$", na=False) & out.isna()
    for idx in s[italian].index:
        day, month, year = s[idx].split()
        if month in MESI_IT:
            out[idx] = pd.Timestamp(int(year), MESI_IT[month], int(day))
            converted += 1
    return out, converted


def _parse_number(value) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.nan
    if isinstance(value, (int, float, np.number)):
        return float(value)
    text = re.sub(r"[€\s]|kg", "", str(value), flags=re.I)
    if not text:
        return np.nan
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return np.nan


def _parse_numbers(s: pd.Series) -> tuple[pd.Series, int]:
    if pd.api.types.is_float_dtype(s):
        return s, 0
    s = _blank_to_nan(s)
    plain = s.str.match(r"^-?\d+(\.\d+)?$", na=True)
    return s.map(_parse_number).astype(float), int((~plain).sum())


def _parse_bool(s: pd.Series) -> pd.Series:
    if s.dtype == bool:
        return s
    return s.map(lambda v: v is True or str(v).strip().lower() in {"true", "1", "sì", "si"})


def pulisci_dataset(df_raw: pd.DataFrame) -> tuple[pd.DataFrame, ReportPulizia]:
    report = ReportPulizia(righe_iniziali=len(df_raw))
    c = report.conteggi
    df = df_raw.copy()
    flags = pd.Series([[] for _ in range(len(df))], index=df.index)

    def flag(mask: pd.Series, name: str) -> None:
        for i in mask[mask].index:
            flags[i].append(name)

    if "qualita_dato" in df:  # input già pulito: ripartiamo dai flag esistenti
        for i, v in df["qualita_dato"].items():
            flags[i] = [f for f in str(v).split(";") if f]
        df = df.drop(columns=["qualita_dato", "mese_previsto"], errors="ignore")

    # Identificativi e duplicati
    df["id_spedizione"] = df["id_spedizione"].astype(str).str.strip().str.upper()
    for col in CATEGORICAL:
        df[col] = _blank_to_nan(df[col])
    for col in ["cliente", "hub_partenza", "servizio"]:
        df[col], n = _canonicalize(df[col], ALIASES.get(col, {}))
        c["categorie_normalizzate"] += n
    upper = df["vettore"].str.upper()
    c["categorie_normalizzate"] += int((upper.fillna("") != df["vettore"].fillna("")).sum())
    df["vettore"] = upper
    dup = df["id_spedizione"].duplicated(keep="first")
    c["duplicati_rimossi"] = int(dup.sum())
    df, flags = df[~dup], flags[~dup]

    # Tipi
    for col in DATES:
        df[col], n = _parse_dates(df[col])
        c["date_convertite"] += n
    for col in NUMBERS:
        df[col], n = _parse_numbers(df[col])
        c["numeri_convertiti"] += n
    for col in INTEGERS:
        df[col] = pd.to_numeric(_blank_to_nan(df[col]), errors="coerce").astype("Int64")
    for col in BOOLEANS:
        df[col] = _parse_bool(df[col])
    if _is_text(df["riserva_alla_consegna"]):
        df["riserva_alla_consegna"] = df["riserva_alla_consegna"].map(
            lambda v: None if v in ("", None) or (isinstance(v, float) and np.isnan(v)) else str(v).lower() == "true"
        )

    # Valori mancanti: il vettore si ricostruisce dalla combinazione servizio + area più frequente.
    for col in ["vettore", "peso_kg", "ricavo_eur", "regione_destinazione"]:
        missing = df[col].isna()
        c["valori_mancanti"] += int(missing.sum())
        flag(missing, f"mancante:{col}")
    missing_vettore = df["vettore"].isna()
    if missing_vettore.any():
        mode = df.dropna(subset=["vettore"]).groupby(["servizio", "area_destinazione"])["vettore"].agg(
            lambda v: v.value_counts().idxmax()
        )
        fill = [mode.get((s, a)) for s, a in zip(df.loc[missing_vettore, "servizio"], df.loc[missing_vettore, "area_destinazione"])]
        df.loc[missing_vettore, "vettore"] = fill
        c["vettori_ricostruiti"] = int(pd.Series(fill).notna().sum())

    # Fuori range
    rules = [("peso_kg", (df["peso_kg"] <= 0) | (df["peso_kg"] >= 1000)),
             ("ricavo_eur", df["ricavo_eur"] <= 0),
             ("costo_trasporto_eur", df["costo_trasporto_eur"] < 0),
             ("valore_merce_eur", df["valore_merce_eur"] <= 0)]
    for col, mask in rules:
        mask = mask.fillna(False)
        c["valori_fuori_range"] += int(mask.sum())
        flag(mask, f"fuori_range:{col}")
        df.loc[mask, col] = np.nan

    # Incoerenze logiche
    future = (df["data_ritiro"] > df["data_consegna_prevista"]).fillna(False)
    c["righe_escluse_date_future"] = int(future.sum())
    df, flags = df[~future], flags[~future]

    before_pickup = (df["data_consegna_effettiva"] < df["data_ritiro"]).fillna(False)
    flag(before_pickup, "data_consegna_incoerente")
    df.loc[before_pickup, "data_consegna_effettiva"] = pd.NaT
    no_date = (df["stato"] == "Consegnata") & df["data_consegna_effettiva"].isna()
    flag(no_date & ~before_pickup, "data_consegna_mancante")
    flag(before_pickup, "data_consegna_mancante")
    claim_without_damage = (~df["danno"]) & (df["importo_reclamo_eur"] > 0)
    flag(claim_without_damage, "reclamo_senza_danno")
    df.loc[claim_without_damage, "importo_reclamo_eur"] = np.nan
    c["incoerenze_logiche"] = int(before_pickup.sum() + (no_date & ~before_pickup).sum() + claim_without_damage.sum())

    df = df.copy()
    df["qualita_dato"] = flags.map(lambda f: ";".join(dict.fromkeys(f)))
    df["mese_previsto"] = df["data_consegna_prevista"].dt.strftime("%Y-%m")
    df = df.reset_index(drop=True)
    report.righe_finali = len(df)
    return df, report
