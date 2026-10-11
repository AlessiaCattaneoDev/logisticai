import pandas as pd
import pytest

from kpi import calcola_penale, calcola_puntualita, margine, tasso_danni

NON_IMPUTABILI = ["Meteo avverso", "Destinatario assente", "Indirizzo errato"]


def _row(**kw):
    base = {
        "cliente": "A", "stato": "Consegnata", "motivo_ritardo": None, "danno": False,
        "data_consegna_prevista": pd.Timestamp("2026-09-10"),
        "data_consegna_effettiva": pd.Timestamp("2026-09-10 11:00"),
        "mese_previsto": "2026-09", "qualita_dato": "", "ricavo_eur": 10.0, "costo_trasporto_eur": 8.0,
        "vettore": "PAD",
    }
    base.update(kw)
    return base


@pytest.fixture
def piccolo():
    late = pd.Timestamp("2026-09-12 10:00")
    return pd.DataFrame([
        _row(),
        _row(),
        _row(data_consegna_effettiva=late, motivo_ritardo="Traffico"),
        _row(data_consegna_effettiva=late, motivo_ritardo="Destinatario assente"),
        _row(stato="Smarrita", data_consegna_effettiva=pd.NaT),
        _row(stato="In transito", data_consegna_effettiva=pd.NaT),
        _row(data_consegna_effettiva=pd.NaT, qualita_dato="data_consegna_mancante"),
        _row(cliente="B", danno=True, ricavo_eur=20.0, costo_trasporto_eur=25.0),
    ])


def test_puntualita_con_esclusioni(piccolo):
    r = calcola_puntualita(piccolo[piccolo.cliente == "A"], cause_escluse=NON_IMPUTABILI).iloc[0]
    # 7 righe: escluse 1 non imputabile + 1 in transito + 1 dato incerto -> misurate 4, puntuali 2
    assert r["spedizioni"] == 7
    assert r["escluse"] == 3
    assert r["misurate"] == 4
    assert r["puntuali"] == 2
    assert r["puntualita"] == pytest.approx(0.5)


def test_puntualita_senza_esclusioni_conta_i_non_imputabili(piccolo):
    r = calcola_puntualita(piccolo[piccolo.cliente == "A"]).iloc[0]
    assert r["misurate"] == 5
    assert r["puntualita"] == pytest.approx(0.4)


def test_puntualita_raggruppata(piccolo):
    r = calcola_puntualita(piccolo, raggruppa_per="cliente").set_index("cliente")
    assert set(r.index) == {"A", "B"}
    assert r.loc["B", "puntualita"] == 1.0


def test_cause_escluse_sconosciute_rifiutate(piccolo):
    with pytest.raises(ValueError, match="Ritardo alieno"):
        calcola_puntualita(piccolo, cause_escluse=["Ritardo alieno"])


@pytest.mark.parametrize("puntualita,attesi", [
    (0.9327, (1.7, 1700.0, True)),
    (0.96, (0.0, 0.0, False)),
    (0.80, (15.0, 5000.0, True)),      # oltre il tetto
])
def test_calcola_penale(puntualita, attesi):
    p = calcola_penale(puntualita, soglia=0.95, penale_per_punto=1000, tetto=5000, spedizioni=109, volume_minimo=50)
    assert (p["punti_sotto_soglia"], p["penale_eur"], p["applicata"]) == attesi


def test_penale_non_applicata_sotto_volume_minimo():
    p = calcola_penale(0.90, soglia=0.95, penale_per_punto=1000, tetto=5000, spedizioni=30, volume_minimo=50)
    assert p["penale_eur"] == 0 and not p["applicata"]
    assert "volume" in p["nota"]


def test_tasso_danni(piccolo):
    r = tasso_danni(piccolo, raggruppa_per="cliente").set_index("cliente")
    assert r.loc["B", "danni"] == 1
    assert r.loc["B", "tasso_danni"] == 1.0
    assert r.loc["A", "consegnate"] == 5  # solo stato Consegnata (anche senza data)


def test_margine(piccolo):
    r = margine(piccolo, raggruppa_per="cliente").set_index("cliente")
    assert r.loc["B", "margine_eur"] == pytest.approx(-5.0)
    assert r.loc["B", "margine_pct"] == pytest.approx(-0.25)


# --- Sul dataset reale: i KPI calcolati dopo la pulizia coincidono con la "verità" ---------

def test_modanova_penali_2026_dal_csv_sporco(cleaned):
    df, _ = cleaned
    moda = df[df["cliente"] == "ModaNova"]
    risultati = calcola_puntualita(moda, cause_escluse=NON_IMPUTABILI, raggruppa_per="mese_previsto").set_index("mese_previsto")
    penali = {
        m: calcola_penale(risultati.loc[m, "puntualita"], 0.95, 1000, 5000, int(risultati.loc[m, "spedizioni"]), 50)["penale_eur"]
        for m in ["2026-07", "2026-08", "2026-09"]
    }
    assert penali["2026-07"] == 0
    assert 1300 <= penali["2026-08"] <= 1700
    assert 1500 <= penali["2026-09"] <= 1900


def test_puntualita_pulita_vicina_alla_verita(cleaned, truth_df):
    df, _ = cleaned
    truth = truth_df.assign(mese_previsto=truth_df["data_consegna_prevista"].dt.strftime("%Y-%m"), qualita_dato="")
    a = calcola_puntualita(df, NON_IMPUTABILI, "cliente").set_index("cliente")["puntualita"]
    b = calcola_puntualita(truth, NON_IMPUTABILI, "cliente").set_index("cliente")["puntualita"]
    assert ((a - b).abs() < 0.005).all()
