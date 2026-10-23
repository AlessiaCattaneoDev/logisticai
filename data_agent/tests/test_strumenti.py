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
        "filtri": {"valori": {"cliente": ["ModaNova"]}, "da_mese": "2026-01", "a_mese": "2026-03", "danno": True},
    }))
    atteso = dati[(dati.cliente == "ModaNova") & dati.mese_previsto.between("2026-01", "2026-03") & dati.danno]
    assert out["anteprima"] == [{"spedizioni": len(atteso)}]


def test_valore_sconosciuto_elenca_quelli_ammessi(s):
    out = s.esegui("aggrega", {"misure": [{"operazione": "conteggio"}], "filtri": {"valori": {"cliente": ["Modanova"]}}})
    assert out.startswith("Errore in aggrega: valori sconosciuti per cliente: ['Modanova']") and "ModaNova" in out


def test_colonne_e_argomenti_fuori_elenco_rifiutati(s):
    assert "Argomenti non validi" in s.esegui("aggrega", {"misure": [{"operazione": "conteggio"}], "filtri": {"valori": {"id_spedizione": ["x"]}}})
    assert "Argomenti non validi" in s.esegui("aggrega", {"misure": [{"operazione": "somma", "colonna": "cliente"}]})
    assert "richiede una colonna" in s.esegui("aggrega", {"misure": [{"operazione": "media"}]})
    assert "Argomenti non validi" in s.esegui("calcola_margine", {"query": "df.drop()"})  # extra vietati
    assert "Argomenti non validi" in s.esegui("verifica_sla_mensile", {"cliente": "ModaNova", "mese": "settembre"})


def test_nessuna_riga_dopo_i_filtri(s):
    out = s.esegui("calcola_puntualita", {"filtri": {"da_mese": "2030-01"}})
    assert "nessuna spedizione con questi filtri" in out


def test_aggrega_misure_quota_ordinamento_e_limite(s):
    out = risultato(s.esegui("aggrega", {
        "raggruppa_per": ["motivo_ritardo"], "filtri": {"valori": {"stato": ["Consegnata"]}},
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

    out = risultato(s.esegui("calcola_tasso_danni", {"raggruppa_per": ["vettore"], "filtri": {"valori": {"vettore": ["VLX"]}}}))
    atteso = tasso_danni(dati[dati.vettore == "VLX"], ["vettore"]).iloc[0]
    assert out["anteprima"][0]["tasso_danni"] == pytest.approx(atteso["tasso_danni"], abs=1e-6)


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
    s.esegui("calcola_tasso_danni", {"raggruppa_per": ["vettore", "mese_previsto"], "filtri": {"da_mese": "2026-01"}})
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
