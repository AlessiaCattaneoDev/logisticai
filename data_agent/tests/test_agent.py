import pytest

from agent import AnalysisError, DataAnalyst
from tests.fakes import FakeToolChatModel, final, run_code

CODICE_PENALE = """
d = pulisci_dataset()
m = d[(d.cliente == 'ModaNova') & (d.mese_previsto == '2026-09')]
p = calcola_puntualita(m, cause_escluse=['Meteo avverso', 'Destinatario assente', 'Indirizzo errato'])
serie = calcola_puntualita(d[d.cliente == 'ModaNova'], ['Meteo avverso', 'Destinatario assente', 'Indirizzo errato'], 'mese_previsto').tail(6)
print(crea_grafico(serie, 'line', x='mese_previsto', y='puntualita', titolo='Puntualità ModaNova', formato_y='percent',
                   linee_riferimento=[{'valore': 0.95, 'etichetta': 'Soglia SLA 95%'}]))
print(crea_tabella(serie, 'Dettaglio mensile'))
print(round(p.puntualita.iloc[0], 4))
"""


def make(responses, raw_df, **kw):
    return DataAnalyst(raw_df, FakeToolChatModel(responses=responses), provider="fake", **kw)


def test_esegue_codice_e_restituisce_artifact_e_sintesi(raw_df):
    analyst = make([run_code(CODICE_PENALE), final("A settembre la puntualità di ModaNova è sotto soglia.")], raw_df)
    res = analyst.analyze("ModaNova è sotto SLA a settembre?", genera_grafico=True, regole="soglia 95%")
    assert res["sintesi"].startswith("A settembre")
    kinds = [a["kind"] for a in res["artifacts"]]
    assert kinds == ["chart", "table"]
    assert res["artifacts"][0]["referenceLines"][0]["value"] == 0.95
    assert "pulisci_dataset()" in res["codice_eseguito"][0]
    assert any("duplicate" in r for r in res["pulizia"])
    assert res["righe_analizzate"] > 11_000


def test_registra_uso_token_per_ogni_chiamata(raw_df):
    analyst = make([run_code("print(len(df))"), final("ok")], raw_df)
    res = analyst.analyze("quante righe?", genera_grafico=False)
    assert len(res["usage"]) == 2
    first = res["usage"][0]
    assert first["provider"] == "fake" and first["model"] == "fake-model"
    assert first["input_tokens"] == 100 and first["output_tokens"] == 20
    assert first["latency_ms"] >= 0


def test_senza_pulizia_il_report_e_vuoto(raw_df):
    analyst = make([run_code("print(df.shape)"), final("ok")], raw_df)
    res = analyst.analyze("forma del dataset", genera_grafico=False)
    assert res["pulizia"] == []
    assert res["righe_analizzate"] == len(raw_df)


def test_ogni_richiesta_ha_artifact_propri(raw_df):
    code = "print(crea_tabella(df.head(3), 'Prime righe', colonne=['id_spedizione', 'cliente']))"
    analyst = make([run_code(code), final("a"), run_code("print(1)"), final("b")], raw_df)
    assert len(analyst.analyze("q1", False)["artifacts"]) == 1
    assert analyst.analyze("q2", False)["artifacts"] == []


def test_errore_negli_helper_torna_all_agente(raw_df):
    bad = "print(crea_grafico(df, 'line', x='cliente', y='colonna_inesistente', titolo='t'))"
    analyst = make([run_code(bad), final("Non sono riuscito a creare il grafico.")], raw_df)
    res = analyst.analyze("grafico", genera_grafico=True)
    assert res["artifacts"] == []
    assert res["sintesi"]


def test_librerie_grafiche_non_disponibili(raw_df):
    analyst = make([run_code("import matplotlib.pyplot as plt"), final("uso crea_grafico")], raw_df)
    res = analyst.analyze("fai un grafico", genera_grafico=True)
    assert res["artifacts"] == []


def test_il_csv_originale_non_viene_modificato(raw_df):
    before = raw_df.copy()
    analyst = make([run_code("df.drop(df.index, inplace=True)"), final("ok")], raw_df)
    analyst.analyze("cancella tutto", genera_grafico=False)
    assert raw_df.equals(before)
    assert len(analyst.df_raw) == len(before)


def test_eccezione_del_modello_diventa_analysis_error(raw_df):
    class Broken(FakeToolChatModel):
        def _generate(self, *a, **k):
            raise RuntimeError("provider giù")

    analyst = DataAnalyst(raw_df, Broken(responses=[]), provider="fake")
    with pytest.raises(AnalysisError, match="provider giù"):
        analyst.analyze("q", genera_grafico=False)


def test_prompt_contiene_regole_e_richiesta_grafico(raw_df):
    analyst = make([final("ok")], raw_df)
    text = analyst.build_input("domanda X", genera_grafico=True, regole="soglia 95%")
    assert "domanda X" in text and "soglia 95%" in text and "crea_grafico" in text


def test_prefix_senza_graffe_doppie():
    """Il prefix è passato come SystemMessage letterale: le graffe doppie arriverebbero all'LLM."""
    from agent import PREFIX

    assert "{{" not in PREFIX and "}}" not in PREFIX
    assert "matplotlib" in PREFIX  # il divieto è esplicito
