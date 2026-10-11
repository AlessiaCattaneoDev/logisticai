import pytest

from config import Settings

BASE = {"INTERNAL_SERVICE_SECRET": "s" * 32, "DATA_LLM_PROVIDER": "openai", "DATA_LLM_MODEL": "m"}


def test_valori_di_default():
    s = Settings.from_env(BASE)
    assert s.csv_path.name == "spedizioni.csv" and s.csv_path.is_absolute()
    assert s.timeout_s == 90 and s.max_iterations == 8
    assert s.model_id == "openai:m"


def test_segreto_obbligatorio_e_lungo():
    with pytest.raises(ValueError, match="INTERNAL_SERVICE_SECRET"):
        Settings.from_env({**BASE, "INTERNAL_SERVICE_SECRET": "corto"})


def test_modello_obbligatorio():
    with pytest.raises(ValueError, match="DATA_LLM_MODEL"):
        Settings.from_env({**BASE, "DATA_LLM_MODEL": ""})
