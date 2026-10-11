import sys
from pathlib import Path

import pandas as pd
import pytest

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "data" / "spedizioni.csv"


@pytest.fixture(scope="session")
def raw_df() -> pd.DataFrame:
    """Il CSV così come lo carica il servizio: tutto testo, nessuna conversione automatica."""
    from dataset import load_raw

    return load_raw(CSV)


@pytest.fixture(scope="session")
def truth_df() -> pd.DataFrame:
    """Il dataset pulito "vero" prodotto dal generatore (solo per i test)."""
    sys.path.insert(0, str(REPO / "data"))
    from generate_dataset import generate_clean

    return generate_clean(seed=42)


@pytest.fixture(scope="session")
def manifest() -> dict:
    import json

    return json.loads((REPO / "data" / "anomalie_manifest.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def cleaned(raw_df):
    from cleaning import pulisci_dataset

    return pulisci_dataset(raw_df)
