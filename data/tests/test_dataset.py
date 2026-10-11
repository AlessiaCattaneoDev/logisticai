"""Test del generatore: struttura, coerenza con business_rules.json, anomalie e storie (PROGETTO.md §5)."""
import hashlib

import numpy as np
import pandas as pd
import pytest

from generate_dataset import CSV_PATH, RULES, generate_clean, inject_anomalies, to_csv_frame

NON_IMPUTABILI = {m for m, v in RULES["motivi_ritardo"].items() if not v["imputabile_a_padana"]}


@pytest.fixture(scope="session")
def clean() -> pd.DataFrame:
    return generate_clean(seed=42)


@pytest.fixture(scope="session")
def dirty_and_manifest(clean):
    return inject_anomalies(clean, seed=42)


def puntualita(df: pd.DataFrame, escludi_non_imputabili: bool = True) -> float:
    """Definizione SLA di business_rules.json -> misurazione_sla."""
    df = df[df["stato"] != "In transito"]
    if escludi_non_imputabili:
        df = df[~df["motivo_ritardo"].isin(NON_IMPUTABILI)]
    consegnata_in_tempo = (df["stato"] == "Consegnata") & (
        df["data_consegna_effettiva"].dt.normalize() <= df["data_consegna_prevista"]
    )
    return consegnata_in_tempo.mean()


def mese(df, ym: str) -> pd.DataFrame:
    return df[df["data_consegna_prevista"].dt.strftime("%Y-%m") == ym]


# --- Struttura -------------------------------------------------------------------------

def test_numero_righe(clean, dirty_and_manifest):
    assert 11_000 <= len(clean) <= 13_000
    dirty, _ = dirty_and_manifest
    assert len(dirty) > len(clean)


def test_id_unici_nel_dataset_pulito(clean):
    assert clean["id_spedizione"].is_unique
    assert clean["id_spedizione"].str.match(r"^SP-\d{4}-\d{6}$").all()


def test_colonne_attese(dirty_and_manifest):
    dirty, _ = dirty_and_manifest
    assert list(dirty.columns) == [
        "id_spedizione", "cliente", "hub_partenza", "data_ritiro", "data_consegna_prevista",
        "data_consegna_effettiva", "regione_destinazione", "area_destinazione", "tipo_destinatario",
        "servizio", "vettore", "num_colli", "peso_kg", "valore_merce_eur", "temperatura_controllata",
        "stato", "tentativi_consegna", "motivo_ritardo", "danno", "riserva_alla_consegna",
        "importo_reclamo_eur", "esito_reclamo", "costo_trasporto_eur", "ricavo_eur",
    ]


def test_periodo(clean):
    assert clean["data_ritiro"].min() >= pd.Timestamp(RULES["periodo_dati"]["inizio"])
    assert clean["data_ritiro"].max() <= pd.Timestamp(RULES["periodo_dati"]["fine"]) + pd.Timedelta(days=1)


# --- Coerenza con le regole di business ------------------------------------------------

def test_valori_categorici_dalle_regole(clean):
    assert set(clean["cliente"]) == set(RULES["clienti"])
    assert set(clean["hub_partenza"]) == set(RULES["hub"])
    assert set(clean["vettore"]) <= set(RULES["vettori"])
    assert set(clean["servizio"]) == set(RULES["servizi"])
    assert set(clean["motivo_ritardo"].dropna()) <= set(RULES["motivi_ritardo"])


def test_hub_del_cliente(clean):
    attesi = clean["cliente"].map({c: v["hub"] for c, v in RULES["clienti"].items()})
    assert (clean["hub_partenza"] == attesi).all()


def test_regione_coerente_con_area(clean):
    regione_area = {r: a for a, regioni in RULES["aree"].items() for r in regioni}
    assert (clean["regione_destinazione"].map(regione_area) == clean["area_destinazione"]).all()


def test_vettore_assegnato_secondo_le_regole(clean):
    atteso = [RULES["assegnazione_vettori"][s][a] for s, a in zip(clean["servizio"], clean["area_destinazione"])]
    assert (clean["vettore"] == atteso).all()


def test_express_mai_verso_le_isole(clean):
    assert not ((clean["servizio"] == "Express 24h") & (clean["area_destinazione"] == "Isole")).any()


def test_data_prevista_secondo_tempi_di_resa(clean):
    holidays = np.array(RULES_HOLIDAYS(), dtype="datetime64[D]")
    sample = clean.sample(500, random_state=1)
    for _, r in sample.iterrows():
        giorni = RULES["servizi"][r["servizio"]]["tempi_resa_giorni_lavorativi"][r["area_destinazione"]]
        base = np.datetime64(r["data_ritiro"].date())
        base = np.busday_offset(base, 0, roll="forward", holidays=holidays)
        if r["data_ritiro"].hour >= 17:
            base = np.busday_offset(base, 1, roll="forward", holidays=holidays)
        attesa = np.busday_offset(base, giorni, roll="forward", holidays=holidays)
        assert pd.Timestamp(attesa) == r["data_consegna_prevista"], r["id_spedizione"]


def RULES_HOLIDAYS():
    from generate_dataset import HOLIDAYS
    return HOLIDAYS


def test_consegnate_hanno_data_effettiva_dopo_il_ritiro(clean):
    consegnate = clean[clean["stato"] == "Consegnata"]
    assert consegnate["data_consegna_effettiva"].notna().all()
    assert (consegnate["data_consegna_effettiva"] > consegnate["data_ritiro"]).all()
    non_consegnate = clean[clean["stato"] != "Consegnata"]
    assert non_consegnate["data_consegna_effettiva"].isna().all()


def test_temperatura_controllata_solo_farmasalus(clean):
    assert set(clean.loc[clean["temperatura_controllata"], "cliente"]) == {"FarmaSalus"}


def test_reclami_solo_con_danno(clean):
    assert (clean.loc[~clean["danno"], "importo_reclamo_eur"] == 0).all()
    assert (clean.loc[clean["danno"], "importo_reclamo_eur"] > 0).all()
    assert clean.loc[clean["danno"], "esito_reclamo"].notna().all()


# --- Storie (PROGETTO.md §5.3) ------------------------------------------------------------

def test_storia_1_picco_natalizio_a_verona(clean):
    picco = clean[clean["data_consegna_prevista"].dt.month.isin([11, 12])]
    vr = puntualita(picco[picco["hub_partenza"] == "HUB-VR"])
    pc = puntualita(picco[picco["hub_partenza"] == "HUB-PC"])
    assert pc - vr >= 0.04, (vr, pc)
    assert (picco.loc[picco["hub_partenza"] == "HUB-VR", "motivo_ritardo"] == "Picco volumi hub").sum() > 50


def test_storia_2_modanova_sotto_sla_ad_agosto_e_settembre_2026(clean):
    moda = clean[clean["cliente"] == "ModaNova"]
    assert puntualita(mese(moda, "2026-08")) < 0.95
    assert puntualita(mese(moda, "2026-09")) < 0.95
    for ym in ["2026-08", "2026-09"]:
        assert len(mese(moda, ym)) >= RULES["misurazione_sla"]["volume_minimo_mensile"]


def test_storia_2_luglio_trappola_delle_esclusioni(clean):
    luglio = mese(clean[clean["cliente"] == "ModaNova"], "2026-07")
    assert 0.95 <= puntualita(luglio) < 0.965
    assert puntualita(luglio, escludi_non_imputabili=False) < 0.95


def test_storia_2_modanova_in_regola_negli_altri_mesi(clean):
    moda = clean[clean["cliente"] == "ModaNova"]
    mesi = sorted(set(moda["data_consegna_prevista"].dt.strftime("%Y-%m")) - {"2026-07", "2026-08", "2026-09", "2026-10"})
    for ym in mesi:
        assert puntualita(mese(moda, ym)) >= 0.96, ym


def test_storia_3_veloceexpress_danneggia(clean):
    consegnate = clean[(clean["stato"] == "Consegnata") & (clean["data_ritiro"] >= "2026-01-01")]
    tassi = consegnate.groupby("vettore")["danno"].mean()
    assert tassi["VLX"] > 0.02
    assert (tassi.drop("VLX") < 0.01).all()
    mensile = (
        consegnate[consegnate["vettore"] == "VLX"]
        .groupby(consegnate["data_ritiro"].dt.to_period("M"))["danno"].mean()
    )
    sopra = (mensile > 0.02).astype(int)
    assert (sopra & sopra.shift(1, fill_value=0)).any(), "servono 2 mesi consecutivi sopra il 2%"


def test_storia_4_express_al_sud_lento(clean):
    express = clean[clean["servizio"] == "Express 24h"]
    assert puntualita(express[express["vettore"] == "SCG"]) < 0.75
    assert puntualita(express[express["vettore"] == "VLX"]) > 0.9


def test_storia_5_casaviva_in_perdita(clean):
    margine = clean.groupby("cliente").apply(
        lambda g: (g["ricavo_eur"].sum() - g["costo_trasporto_eur"].sum()) / g["ricavo_eur"].sum(),
        include_groups=False,
    )
    assert margine["CasaViva Arredo"] < 0
    assert (margine.drop("CasaViva Arredo") > 0.05).all()


def test_storia_6_preavviso_sms_riduce_le_giacenze(clean):
    b2c = clean[clean["tipo_destinatario"] == "B2C"]
    prima = b2c[b2c["data_ritiro"] < "2025-03-01"]
    dopo = b2c[b2c["data_ritiro"] >= "2025-03-01"]
    tasso = lambda d: (d["motivo_ritardo"] == "Destinatario assente").mean()
    assert tasso(dopo) <= tasso(prima) * 0.7


def test_storia_7_crescita_techpoint(clean):
    tech = clean[clean["cliente"] == "TechPoint"]
    anno1 = (tech["data_ritiro"] < "2025-10-01").sum()
    anno2 = (tech["data_ritiro"] >= "2025-10-01").sum()
    assert anno2 / anno1 >= 1.4


# --- Anomalie (PROGETTO.md §5.2) ---------------------------------------------------------

def test_quota_complessiva_anomalie(clean, dirty_and_manifest):
    _, manifest = dirty_and_manifest
    righe_toccate = manifest["righe_con_anomalie"]
    assert 0.06 <= righe_toccate / len(clean) <= 0.12


@pytest.mark.parametrize("tipo", [
    "duplicati_esatti", "quasi_duplicati", "valori_mancanti", "date_formati_misti",
    "categorie_incoerenti", "numeri_formato_testo", "fuori_range", "incoerenze_logiche",
])
def test_ogni_tipo_di_anomalia_presente(dirty_and_manifest, tipo):
    _, manifest = dirty_and_manifest
    assert manifest["anomalie"][tipo]["conteggio"] > 0
    assert manifest["anomalie"][tipo]["esempi"]


def test_duplicati_esatti_nel_csv(dirty_and_manifest):
    dirty, manifest = dirty_and_manifest
    assert dirty.duplicated().sum() >= manifest["anomalie"]["duplicati_esatti"]["conteggio"] * 0.9


def test_formati_data_misti(dirty_and_manifest):
    dirty, _ = dirty_and_manifest
    col = dirty["data_ritiro"].dropna()
    assert col.str.match(r"^\d{4}-\d{2}-\d{2}").mean() > 0.9
    assert col.str.match(r"^\d{2}/\d{2}/\d{4}").any()
    assert col.str.match(r"^\d{2}-\d{2}-\d{4}").any()
    assert col.str.match(r"^\d{1,2} [a-z]{3} \d{4}").any()


def test_categorie_incoerenti(dirty_and_manifest):
    dirty, _ = dirty_and_manifest
    assert len(set(dirty["cliente"].dropna())) > len(RULES["clienti"])
    assert set(dirty["hub_partenza"].dropna()) - set(RULES["hub"])


def test_numeri_in_formato_testo(dirty_and_manifest):
    dirty, _ = dirty_and_manifest
    ricavi = dirty["ricavo_eur"].dropna().astype(str)
    assert ricavi.str.contains("€").any() or ricavi.str.contains(r"\d\.\d{3},\d", regex=True).any()


# --- Riproducibilità -------------------------------------------------------------------

def test_generazione_deterministica():
    a = to_csv_frame(inject_anomalies(generate_clean(seed=7), seed=7)[0]).to_csv(index=False)
    b = to_csv_frame(inject_anomalies(generate_clean(seed=7), seed=7)[0]).to_csv(index=False)
    assert hashlib.sha256(a.encode()).hexdigest() == hashlib.sha256(b.encode()).hexdigest()


def test_csv_versionato_aggiornato(dirty_and_manifest):
    """Il CSV nel repo deve corrispondere all'output del generatore (seed 42)."""
    dirty, _ = dirty_and_manifest
    attuale = to_csv_frame(dirty).to_csv(index=False)
    assert CSV_PATH.exists(), "esegui: python generate_dataset.py"
    assert CSV_PATH.read_text(encoding="utf-8") == attuale, "CSV non aggiornato: esegui python generate_dataset.py"
