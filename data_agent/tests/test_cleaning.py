import pandas as pd
import pytest

from cleaning import pulisci_dataset

CLIENTI = {"ModaNova", "TechPoint", "BellaPelle Cosmetici", "CasaViva Arredo", "FarmaSalus",
           "GustoItaliano", "BrianzaUtensili", "KidsPlanet", "SportLab", "LibriMondo"}


def test_rimuove_duplicati_esatti_e_quasi(cleaned, manifest):
    df, report = cleaned
    assert df["id_spedizione"].is_unique
    attesi = manifest["anomalie"]["duplicati_esatti"]["conteggio"] + manifest["anomalie"]["quasi_duplicati"]["conteggio"]
    assert report.conteggi["duplicati_rimossi"] == attesi


def test_categorie_normalizzate(cleaned):
    df, report = cleaned
    assert set(df["cliente"]) == CLIENTI
    assert set(df["hub_partenza"]) == {"HUB-PC", "HUB-VR"}
    assert set(df["servizio"]) == {"Standard 24/48h", "Express 24h", "Isole", "Voluminoso"}
    assert set(df["vettore"].dropna()) == {"PAD", "TRS", "VLX", "SCG", "ISX"}
    assert report.conteggi["categorie_normalizzate"] > 0


def test_date_in_formati_misti_convertite(cleaned):
    df, report = cleaned
    for col in ["data_ritiro", "data_consegna_prevista", "data_consegna_effettiva"]:
        assert pd.api.types.is_datetime64_any_dtype(df[col]), col
    assert df["data_ritiro"].notna().all()
    assert report.conteggi["date_convertite"] > 0


def test_numeri_testuali_convertiti(cleaned):
    df, report = cleaned
    for col in ["peso_kg", "valore_merce_eur", "importo_reclamo_eur", "costo_trasporto_eur", "ricavo_eur"]:
        assert pd.api.types.is_float_dtype(df[col]), col
    assert report.conteggi["numeri_convertiti"] > 0


def test_valori_fuori_range_annullati(cleaned):
    df, report = cleaned
    assert (df["peso_kg"].dropna() > 0).all()
    assert (df["peso_kg"].dropna() < 1000).all()
    assert (df["ricavo_eur"].dropna() > 0).all()
    assert (df["costo_trasporto_eur"].dropna() >= 0).all()
    assert report.conteggi["valori_fuori_range"] > 0


def test_incoerenze_logiche(cleaned):
    df, report = cleaned
    consegna = df["data_consegna_effettiva"]
    assert not (consegna < df["data_ritiro"]).any()
    assert (df["data_ritiro"] <= pd.Timestamp("2026-10-01")).all(), "date future da escludere"
    assert not ((~df["danno"]) & (df["importo_reclamo_eur"] > 0)).any()
    assert report.conteggi["incoerenze_logiche"] > 0
    assert report.conteggi["righe_escluse_date_future"] > 0


def test_flag_qualita_per_le_righe_incerte(cleaned):
    df, _ = cleaned
    senza_data = (df["stato"] == "Consegnata") & df["data_consegna_effettiva"].isna()
    assert senza_data.any()
    assert df.loc[senza_data, "qualita_dato"].str.contains("data_consegna_mancante").all()


def test_booleani(cleaned):
    df, _ = cleaned
    assert df["danno"].dtype == bool
    assert df["temperatura_controllata"].dtype == bool


def test_colonna_mese_previsto(cleaned):
    df, _ = cleaned
    assert df["mese_previsto"].str.match(r"^\d{4}-\d{2}$").all()


def test_valori_identici_al_dataset_vero_sulle_righe_non_toccate(cleaned, truth_df, manifest):
    df, _ = cleaned
    merged = truth_df.merge(df, on="id_spedizione", suffixes=("_vero", ""))
    assert len(merged) >= len(truth_df) * 0.99
    ok = merged["qualita_dato"] == ""
    for col in ["cliente", "hub_partenza", "servizio", "stato", "area_destinazione"]:
        assert (merged.loc[ok, col] == merged.loc[ok, f"{col}_vero"]).all(), col
    for col in ["ricavo_eur", "peso_kg"]:
        diff = (merged.loc[ok, col] - merged.loc[ok, f"{col}_vero"]).abs().dropna()
        assert (diff < 0.01).all(), col


def test_report_leggibile(cleaned):
    _, report = cleaned
    righe = report.come_testo()
    assert any("duplicat" in r for r in righe)
    assert all(isinstance(r, str) and r for r in righe)


def test_idempotente(cleaned):
    df, _ = cleaned
    df2, report2 = pulisci_dataset(df)
    assert len(df2) == len(df)
    assert report2.conteggi["duplicati_rimossi"] == 0


def test_non_modifica_il_dataframe_originale(raw_df):
    copia = raw_df.copy()
    pulisci_dataset(raw_df)
    pd.testing.assert_frame_equal(raw_df, copia)
