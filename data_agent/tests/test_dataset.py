import pytest

from dataset import SCHEMA, DatasetNonValido, carica_dataset, valida_dataset
from tests.conftest import CSV


def test_il_csv_del_progetto_e_valido(raw_df):
    report = valida_dataset(raw_df)
    assert report.valido and report.errori == []
    assert report.righe == 12240
    assert list(raw_df.columns) == list(SCHEMA)


def test_colonne_mancanti_bloccano(raw_df):
    report = valida_dataset(raw_df.drop(columns=["stato", "ricavo_eur"]))
    assert report.errori == ["colonne mancanti: stato, ricavo_eur"]


def test_colonne_in_piu_sono_un_avviso(raw_df):
    report = valida_dataset(raw_df.assign(note="x"))
    assert report.valido and report.avvisi == ["colonne non previste (ignorate): note"]


def test_tipo_sbagliato_blocca_con_esempi(raw_df):
    df = raw_df.copy()
    df["data_ritiro"] = "domani"
    report = valida_dataset(df)
    assert not report.valido
    assert report.errori[0].startswith("data_ritiro: 12240 valori non interpretabili come data") and "'domani'" in report.errori[0]


def test_pochi_valori_sbagliati_sono_un_avviso(raw_df):
    df = raw_df.copy()
    df.loc[:9, "peso_kg"] = "pesante"
    df.loc[:4, "danno"] = "forse"
    report = valida_dataset(df)
    assert report.valido
    assert any(a.startswith("peso_kg: 10 valori non interpretabili come numero") for a in report.avvisi)
    assert any(a.startswith("danno: 5 valori non interpretabili come booleano") for a in report.avvisi)


def test_colonna_obbligatoria_vuota_blocca(raw_df):
    df = raw_df.copy()
    df["cliente"] = ""
    assert any(e.startswith("cliente: 12240 valori vuoti") for e in valida_dataset(df).errori)


def test_file_vuoto_o_assente(tmp_path):
    with pytest.raises(DatasetNonValido, match="CSV non trovato"):
        carica_dataset(tmp_path / "manca.csv")
    vuoto = tmp_path / "vuoto.csv"
    vuoto.write_text("")
    with pytest.raises(DatasetNonValido, match="CSV non leggibile"):
        carica_dataset(vuoto)
    solo_header = tmp_path / "header.csv"
    solo_header.write_text(",".join(SCHEMA) + "\n")
    with pytest.raises(DatasetNonValido, match="il file non contiene righe"):
        carica_dataset(solo_header)


def test_carica_dataset_elenca_tutti_gli_errori(tmp_path, raw_df):
    path = tmp_path / "rotto.csv"
    raw_df.drop(columns=["vettore"]).assign(num_colli="tanti").to_csv(path, index=False)
    with pytest.raises(DatasetNonValido) as exc:
        carica_dataset(path)
    msg = str(exc.value)
    assert "colonne mancanti: vettore" in msg and "num_colli" in msg


def test_carica_dataset_valido():
    df, report = carica_dataset(CSV)
    assert len(df) == 12240 and report.valido
