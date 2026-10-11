"""Test di contratto: le stesse fixture sono validate anche dallo schema zod in shared/types."""
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from specs import MAX_CHART_POINTS, Artifact, ChartSpec

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "contracts" / "fixtures"
artifact_adapter = TypeAdapter(Artifact)


def _load(sub: str):
    files = sorted((FIXTURES / sub).glob("*.json"))
    assert files, f"nessuna fixture in {sub}"
    return [pytest.param(json.loads(f.read_text()), id=f.name) for f in files]


@pytest.mark.parametrize("payload", _load("valid"))
def test_accetta_fixture_valide(payload):
    artifact_adapter.validate_python(payload)


@pytest.mark.parametrize("payload", _load("invalid"))
def test_rifiuta_fixture_non_valide(payload):
    with pytest.raises(ValidationError):
        artifact_adapter.validate_python(payload)


def test_rifiuta_grafici_troppo_grandi():
    data = [{"x": i, "y": i} for i in range(MAX_CHART_POINTS + 1)]
    with pytest.raises(ValidationError):
        ChartSpec.model_validate(
            {"kind": "chart", "id": "big", "type": "line", "title": "t", "xKey": "x",
             "series": [{"key": "y", "label": "y"}], "data": data}
        )


def test_serializza_con_nomi_camel_case():
    spec = ChartSpec.model_validate(
        {"kind": "chart", "id": "a", "type": "bar", "title": "t", "xKey": "k",
         "series": [{"key": "v", "label": "V"}], "data": [{"k": "x", "v": 1}]}
    )
    dumped = spec.model_dump(by_alias=True, exclude_none=True)
    assert dumped["xKey"] == "k"
    assert "x_key" not in dumped
