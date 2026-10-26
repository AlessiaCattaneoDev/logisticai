import pytest

from cache import normalizza
from firma import calcola_firma, confrontabile
from main import entita_della_cache
from valutazione_cache import DIVERSE, DIVERSE_CONTROLLO, PARAFRASI


@pytest.fixture(scope="module", autouse=True)
def _entita(cleaned):
    global ENTITA
    ENTITA = {normalizza(k): normalizza(v) for k, v in entita_della_cache(cleaned[0]).items()}  # come CacheAnalisi


ENTITA: dict[str, str] = {}


def firma(testo: str) -> frozenset[str]:
    return calcola_firma(normalizza(testo), ENTITA)


# Le coppie stanno in valutazione_cache.py (stesso insieme del report benchmark/CACHE_PARAFRASI.md).
TUTTE_LE_DIVERSE = [(a, b) for _, a, b in DIVERSE + DIVERSE_CONTROLLO]


@pytest.mark.parametrize("a,b", [(a, b) for _, a, b in PARAFRASI])
def test_parafrasi_stessa_firma(a, b):
    """Regressione del lessico: le parafrasi usate per metterlo a punto devono restare riconosciute."""
    assert firma(a) == firma(b)
    assert confrontabile(firma(a))


@pytest.mark.parametrize("a,b", TUTTE_LE_DIVERSE)
def test_domande_diverse_firma_diversa(a, b):
    """Nessuna domanda diversa può avere la stessa firma: è ciò che evita le risposte improprie."""
    assert firma(a) != firma(b)


def test_ordine_dei_raggruppamenti():
    assert firma("Danni dei vettori per hub") != firma("Danni degli hub per vettore")
    assert firma("Puntualità mensile per hub") == firma("Puntualità di ogni hub mese per mese")  # il tempo non conta


def test_contenuto_della_firma():
    f = firma("Tasso di danni di VLX per hub a settembre 2026: i peggiori 3")
    assert f == {"misura:percentuale", "metrica:danni", "entita:vlx", "per:hub", "mese:9", "numero:2026", "direzione:peggio", "numero:3"}


def test_alias_dei_clienti_dal_nome_composto():
    assert firma("Margine di CasaViva Arredo") == firma("margine di casaviva")


def test_entita_composte_prima_delle_parole():
    """'Picco volumi hub' è un motivo di ritardo: non deve diventare metrica volumi + raggruppamento per hub."""
    assert firma("ritardi per picco volumi hub") == {"metrica:ritardi", "entita:picco volumi hub"}
    assert firma("ritardi da HUB-VR") == {"metrica:ritardi", "entita:hub vr"}


def test_senza_metrica_non_si_cercano_parafrasi():
    assert not confrontabile(firma("come stanno andando le cose?"))
    assert not confrontabile(firma("ModaNova"))
    assert confrontabile(firma("Spedizioni Smarrita per vettore"))
