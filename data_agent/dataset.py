"""Caricamento del CSV grezzo: tutto come testo, così le anomalie restano visibili all'agente."""
from pathlib import Path

import pandas as pd


def load_raw(path: Path | str) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)
