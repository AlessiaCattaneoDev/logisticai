import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from artifacts import ArtifactRegistry
from specs import MAX_CHART_POINTS, MAX_TABLE_ROWS, ChartSpec, TableSpec

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def reg():
    return ArtifactRegistry()


@pytest.fixture
def mensile():
    return pd.DataFrame({
        "mese": pd.to_datetime(["2026-07-01", "2026-08-01", "2026-09-01"]),
        "puntualita": [0.9558, 0.9355, np.nan],
        "spedizioni": np.array([118, 62, 109], dtype=np.int64),
    })


def test_grafico_a_linee_con_soglia(reg, mensile):
    msg = reg.crea_grafico(mensile, "line", x="mese", y="puntualita", titolo="Puntualità ModaNova",
                           formato_y="percent", linee_riferimento=[{"valore": 0.95, "etichetta": "Soglia SLA 95%"}])
    [spec] = reg.artifacts
    assert isinstance(spec, ChartSpec)
    assert spec.data[0] == {"mese": "2026-07-01", "puntualita": 0.9558}
    assert spec.data[2]["puntualita"] is None                     # NaN -> null
    assert spec.reference_lines[0].value == 0.95
    assert spec.allowed_types == ["line", "bar", "area"]
    assert "Puntualità ModaNova" in msg and "3 punti" in msg


def test_tipi_numpy_convertiti_in_json(reg, mensile):
    reg.crea_grafico(mensile, "bar", x="mese", y=["spedizioni"], titolo="Volumi")
    payload = reg.as_json()
    json.dumps(payload)                                              # non deve sollevare
    assert payload[0]["data"][0]["spedizioni"] == 118
    assert payload[0]["xKey"] == "mese"                              # camelCase come i tipi TS


def test_usa_l_indice_se_x_non_e_una_colonna(reg):
    df = pd.DataFrame({"cliente": ["A", "B", "A"], "v": [1, 2, 3]}).groupby("cliente")["v"].sum().to_frame()
    reg.crea_grafico(df, "bar", x="cliente", y="v", titolo="Per cliente")
    assert reg.artifacts[0].data == [{"cliente": "A", "v": 4}, {"cliente": "B", "v": 2}]


def test_etichette_delle_serie(reg, mensile):
    reg.crea_grafico(mensile, "line", x="mese", y="puntualita", titolo="t", etichette={"puntualita": "Puntualità SLA"})
    assert reg.artifacts[0].series[0].label == "Puntualità SLA"


def test_colonna_inesistente_errore_leggibile(reg, mensile):
    with pytest.raises(ValueError, match="non_esiste"):
        reg.crea_grafico(mensile, "line", x="mese", y="non_esiste", titolo="t")


def test_troppi_punti_chiede_di_aggregare(reg):
    df = pd.DataFrame({"x": range(MAX_CHART_POINTS + 1), "y": range(MAX_CHART_POINTS + 1)})
    with pytest.raises(ValueError, match="aggrega"):
        reg.crea_grafico(df, "line", x="x", y="y", titolo="t")
    assert reg.artifacts == []


def test_torta_con_una_serie(reg):
    df = pd.DataFrame({"servizio": ["Standard", "Express"], "n": [10, 5]})
    reg.crea_grafico(df, "pie", x="servizio", y="n", titolo="Mix servizi")
    assert reg.artifacts[0].type == "pie"


def test_tabella_con_formati_inferiti_e_totali(reg):
    df = pd.DataFrame({
        "cliente": ["ModaNova", "CasaViva Arredo"],
        "spedizioni": np.array([820, 210]),
        "ricavo_eur": [7298.0, 9450.5],
        "margine_pct": [0.18, -0.07],
    })
    reg.crea_tabella(df, "Margini", formati={"ricavo_eur": "currency_eur", "margine_pct": "percent"},
                     totali=True, ordina_per="margine_pct", crescente=True)
    [spec] = reg.artifacts
    assert isinstance(spec, TableSpec)
    fmt = {c.key: c.format for c in spec.columns}
    assert fmt == {"cliente": "string", "spedizioni": "integer", "ricavo_eur": "currency_eur", "margine_pct": "percent"}
    assert spec.totals == {"cliente": "Totale", "spedizioni": 1030, "ricavo_eur": 16748.5, "margine_pct": None}
    assert spec.default_sort.key == "margine_pct" and spec.default_sort.direction == "asc"
    assert {c.key: c.align for c in spec.columns}["ricavo_eur"] == "right"


def test_tabella_troppo_lunga(reg):
    df = pd.DataFrame({"a": range(MAX_TABLE_ROWS + 1)})
    with pytest.raises(ValueError, match="righe"):
        reg.crea_tabella(df, "t")


def test_riepilogo_per_l_llm_senza_dati(reg, mensile):
    reg.crea_grafico(mensile, "line", x="mese", y="puntualita", titolo="Puntualità")
    reg.crea_tabella(mensile, "Dettaglio")
    riepilogo = reg.riepilogo()
    assert riepilogo == ["grafico line: 'Puntualità' (3 punti)", "tabella: 'Dettaglio' (3 righe, 3 colonne)"]


def test_output_valido_per_lo_schema_condiviso(reg, mensile):
    """Ogni spec prodotta deve passare anche lo schema di contratto (stesso di zod)."""
    from pydantic import TypeAdapter

    from specs import Artifact

    reg.crea_grafico(mensile, "area", x="mese", y=["puntualita"], titolo="t")
    reg.crea_tabella(mensile, "t2")
    for payload in reg.as_json():
        TypeAdapter(Artifact).validate_python(payload)


def test_stesso_titolo_sostituisce_il_precedente(reg, mensile):
    reg.crea_grafico(mensile, "line", x="mese", y="puntualita", titolo="Puntualità")
    reg.crea_grafico(mensile, "bar", x="mese", y="puntualita", titolo="Puntualità")
    assert len(reg.artifacts) == 1
    assert reg.artifacts[0].type == "bar"


def test_tetto_al_numero_di_artifact(reg, mensile):
    from artifacts import MAX_ARTIFACTS

    for i in range(MAX_ARTIFACTS):
        reg.crea_tabella(mensile, f"t{i}")
    with pytest.raises(ValueError, match="sintesi"):
        reg.crea_tabella(mensile, "una di troppo")


def test_gruppo_trasforma_dati_lunghi_in_serie(reg):
    lungo = pd.DataFrame({
        "mese_previsto": ["2026-08", "2026-08", "2026-09", "2026-09"],
        "hub_partenza": ["HUB-PC", "HUB-VR", "HUB-PC", "HUB-VR"],
        "puntualita": [0.97, 0.95, 0.96, np.nan],
    })
    reg.crea_grafico(lungo, "line", x="mese_previsto", y="puntualita", titolo="Per hub", gruppo="hub_partenza", formato_y="percent")
    spec = reg.artifacts[0]
    assert [s.key for s in spec.series] == ["HUB-PC", "HUB-VR"]
    assert spec.data == [
        {"mese_previsto": "2026-08", "HUB-PC": 0.97, "HUB-VR": 0.95},
        {"mese_previsto": "2026-09", "HUB-PC": 0.96, "HUB-VR": None},
    ]
