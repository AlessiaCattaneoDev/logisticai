import json

import pytest

from strumenti import STRUMENTI, Sessione, prepara_dati


@pytest.fixture(scope="module")
def dati(cleaned):
    return prepara_dati(cleaned[0])


@pytest.fixture
def s(dati):
    return Sessione(dati)


def risultato(out: str) -> dict:
    return json.loads(out)


def test_colonne_derivate(dati):
    assert set(dati["anno"].dropna()) == {"2024", "2025", "2026"}
    consegnate = dati[dati["stato"] == "Consegnata"]
    assert consegnate["giorni_ritardo"].notna().mean() > 0.95
    assert dati.loc[dati["stato"] != "Consegnata", "giorni_ritardo"].isna().all()


def test_filtri_per_valore_periodo_e_booleani(s, dati):
    out = risultato(s.esegui("aggrega", {
        "misure": [{"operazione": "conteggio"}],
        "filtri": {"cliente": ["ModaNova"]}, "da_mese": "2026-01", "a_mese": "2026-03", "danno": True,
    }))
    atteso = dati[(dati.cliente == "ModaNova") & dati.mese_previsto.between("2026-01", "2026-03") & dati.danno]
    assert out["anteprima"] == [{"spedizioni": len(atteso)}]


def test_valore_sconosciuto_elenca_quelli_ammessi(s):
    out = s.esegui("aggrega", {"misure": [{"operazione": "conteggio"}], "filtri": {"cliente": ["Modanova"]}})
    assert out.startswith("Errore in aggrega: valori sconosciuti per cliente: ['Modanova']") and "ModaNova" in out


def test_colonne_e_argomenti_fuori_elenco_rifiutati(s):
    assert "Argomenti non validi" in s.esegui("aggrega", {"misure": [{"operazione": "conteggio"}], "filtri": {"id_spedizione": ["x"]}})
    assert "Argomenti non validi" in s.esegui("aggrega", {"misure": [{"operazione": "somma", "colonna": "cliente"}]})
    assert "richiede una colonna" in s.esegui("aggrega", {"misure": [{"operazione": "media"}]})
    assert "Argomenti non validi" in s.esegui("calcola_margine", {"query": "df.drop()"})  # extra vietati
    assert "Argomenti non validi" in s.esegui("verifica_sla_mensile", {"cliente": "ModaNova", "mese": "settembre"})


def test_periodo_come_argomento_di_primo_livello(s, dati):
    """Regressione dal vivo: 'tasso danni per vettore nel 2026' calcolato su tutto lo storico."""
    out = risultato(s.esegui("calcola_tasso_danni", {"da_mese": "2026-01", "a_mese": "2026-12", "raggruppa_per": ["vettore"], "ordina_per": "tasso_danni"}))
    vlx = next(r for r in out["anteprima"] if r["vettore"] == "VLX")
    assert vlx["consegnate"] == int(((dati.vettore == "VLX") & (dati.anno == "2026") & (dati.stato == "Consegnata")).sum())
    assert vlx["tasso_danni"] == pytest.approx(0.0348, abs=1e-3)
    assert out["anteprima"][0]["vettore"] == "VLX"


def test_nessuna_riga_dopo_i_filtri(s):
    out = s.esegui("calcola_puntualita", {"da_mese": "2030-01"})
    assert "nessuna spedizione con questi filtri" in out


def test_aggrega_misure_quota_ordinamento_e_limite(s):
    out = risultato(s.esegui("aggrega", {
        "raggruppa_per": ["motivo_ritardo"], "filtri": {"stato": ["Consegnata"]},
        "misure": [{"operazione": "conteggio"}, {"operazione": "media", "colonna": "giorni_ritardo"}],
        "quota": True, "ordina_per": "spedizioni", "limite": 3,
    }))
    assert out["colonne"] == ["motivo_ritardo", "spedizioni", "media_giorni_ritardo", "quota"]
    righe = out["anteprima"]
    assert len(righe) == 3 and righe[0]["spedizioni"] >= righe[1]["spedizioni"] >= righe[2]["spedizioni"]
    tutte = s.risultati["R1"]
    assert out["righe"] == 3 and len(tutte) == 3


def test_quota_somma_a_uno(s):
    s.esegui("aggrega", {"raggruppa_per": ["hub_partenza"], "misure": [{"operazione": "conteggio"}], "quota": True})
    assert s.risultati["R1"]["quota"].sum() == pytest.approx(1.0)


def test_ordina_per_colonna_inesistente(s):
    assert "ordina_per 'margine'" in s.esegui("calcola_margine", {"raggruppa_per": ["cliente"], "ordina_per": "margine"})


def test_kpi_uguali_alle_funzioni_di_kpi(s, dati):
    from kpi import tasso_danni

    out = risultato(s.esegui("calcola_tasso_danni", {"raggruppa_per": ["vettore"], "filtri": {"vettore": ["VLX"]}}))
    atteso = tasso_danni(dati[dati.vettore == "VLX"], ["vettore"]).iloc[0]
    assert out["anteprima"][0]["tasso_danni"] == pytest.approx(atteso["tasso_danni"], abs=1e-6)


def test_sla_registra_l_andamento_per_il_grafico(s):
    out = risultato(s.esegui("verifica_sla_mensile", {"cliente": "ModaNova", "mese": "2026-09", "soglia": 0.95, "penale_per_punto": 1000,
                                                       "tetto": 5000, "volume_minimo": 50, "cause_escluse": ["Meteo avverso", "Destinatario assente", "Indirizzo errato"]}))
    assert out["penale_eur"] == 1700.0
    trend = s.risultati[out["andamento"]["risultato"]]
    assert list(trend["mese_previsto"]) == ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    assert trend["puntualita"].iloc[-1] == pytest.approx(out["puntualita"], abs=1e-4)
    grafico = {"risultato": out["andamento"]["risultato"], "tipo": "line", "x": "mese_previsto", "y": "puntualita", "titolo": "Puntualità"}
    assert s.esegui("crea_grafico", grafico).startswith("Grafico registrato")


def test_sla_cliente_sconosciuto(s):
    out = s.esegui("verifica_sla_mensile", {"cliente": "Acme", "mese": "2026-09", "soglia": 0.95, "penale_per_punto": 1000, "tetto": 5000})
    assert "cliente 'Acme' sconosciuto" in out


def test_subvettori_restituisce_un_risultato(s):
    out = risultato(s.esegui("valuta_subvettori", {"soglia_piano": 0.02, "soglia_sospensione": 0.03, "mesi_consecutivi": 2}))
    assert out["risultato"] == "R1" and "esito" in out["colonne"]


def test_anteprima_limitata_ma_risultato_completo(s):
    out = risultato(s.esegui("calcola_puntualita", {"raggruppa_per": ["cliente", "mese_previsto"]}))
    assert out["righe"] > 25 and len(out["anteprima"]) == 25 and "nota" in out
    assert len(s.risultati["R1"]) == out["righe"]


def test_grafico_e_tabella_da_un_risultato(s):
    s.esegui("calcola_tasso_danni", {"raggruppa_per": ["vettore", "mese_previsto"], "da_mese": "2026-01"})
    msg = s.esegui("crea_grafico", {"risultato": "R1", "tipo": "line", "x": "mese_previsto", "y": "tasso_danni", "titolo": "Trend danni",
                                    "gruppo": "vettore", "formato_y": "percent"})
    assert msg.startswith("Grafico registrato")
    assert s.esegui("crea_tabella", {"risultato": "R1", "titolo": "Dettaglio", "formati": {"tasso_danni": "percent"}}).startswith("Tabella registrata")
    chart = s.registry.as_json()[0]
    assert len(chart["series"]) > 3  # una serie per vettore


def test_grafico_da_risultato_inesistente(s):
    out = s.esegui("crea_grafico", {"risultato": "R7", "tipo": "bar", "x": "a", "y": "b", "titolo": "t"})
    assert "risultato R7 inesistente" in out


def test_ogni_strumento_ha_descrizione():
    assert all(len(st.descrizione) > 30 for st in STRUMENTI.values())
