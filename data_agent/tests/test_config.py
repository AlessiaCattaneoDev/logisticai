import pytest

from config import Settings

BASE = {"INTERNAL_SERVICE_SECRET": "s" * 32, "DATA_LLM_PROVIDER": "openai", "DATA_LLM_MODEL": "m"}


def test_valori_di_default():
    s = Settings.from_env(BASE)
    assert s.csv_path.name == "spedizioni.csv" and s.csv_path.is_absolute()
    assert s.timeout_s == 90 and s.max_iterations == 8
    assert s.model_id == "openai:m"
    assert s.cache_ttl_s == 3600 and s.cache_max_voci == 256


def test_parafrasi_con_il_modello_di_embedding_del_backend():
    s = Settings.from_env({**BASE, "EMBEDDING_PROVIDER": "openai", "EMBEDDING_MODEL": "text-embedding-3-small"})
    assert s.embedding_id == "openai:text-embedding-3-small" and s.cache_soglia == 0.6
    assert Settings.from_env(BASE).embedding_id is None  # senza modello: solo cache esatta
    spenta = Settings.from_env({**BASE, "EMBEDDING_PROVIDER": "openai", "EMBEDDING_MODEL": "m", "DATA_AGENT_CACHE_PARAFRASI": "0"})
    assert spenta.embedding_id is None
    assert Settings.from_env({**BASE, "DATA_AGENT_CACHE_SOGLIA": "0.7"}).cache_soglia == 0.7


def test_cache_configurabile_e_disattivabile():
    s = Settings.from_env({**BASE, "DATA_AGENT_CACHE_TTL_S": "0", "DATA_AGENT_CACHE_MAX_VOCI": "10"})
    assert s.cache_ttl_s == 0 and s.cache_max_voci == 10


def test_segreto_obbligatorio_e_lungo():
    with pytest.raises(ValueError, match="INTERNAL_SERVICE_SECRET"):
        Settings.from_env({**BASE, "INTERNAL_SERVICE_SECRET": "corto"})


def test_modello_obbligatorio():
    with pytest.raises(ValueError, match="DATA_LLM_MODEL"):
        Settings.from_env({**BASE, "DATA_LLM_MODEL": ""})
