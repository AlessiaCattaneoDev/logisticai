import pytest

from cache import normalizza
from firma import calcola_firma, confrontabile

ENTITA = [normalizza(e) for e in ["ModaNova", "TechPoint", "VLX", "SCG", "HUB-VR", "HUB-PC", "Express 24h", "Destinatario assente", "Picco volumi hub"]]


def firma(testo: str) -> frozenset[str]:
    return calcola_firma(normalizza(testo), ENTITA)


# Coppie misurate con text-embedding-3-small (similarità tra parentesi): parafrasi da riconoscere...
PARAFRASI = [
    ("Qual è il margine per cliente nel 2026?", "Quanto guadagniamo su ogni cliente nel 2026?"),             # 0,75
    ("Qual è il tasso di danni per vettore nel 2026?", "Nel 2026 quanti danni fa ogni vettore, in percentuale?"),  # 0,80
    ("ModaNova ha diritto a penali per settembre 2026?", "A settembre 2026 dobbiamo pagare penali a ModaNova?"),  # 0,81
    ("Quali sono i motivi di ritardo più frequenti?", "Per quali cause arrivano più spesso in ritardo le spedizioni?"),  # 0,65
    ("Puntualità mensile per hub", "Mostrami la puntualità di ogni hub mese per mese"),                       # 0,81
    ("Qual è il margine per cliente?", "margine di ciascun cliente"),                                          # 0,88
]
# ...e domande diverse che gli embedding da soli scambierebbero.
DIVERSE = [
    ("ModaNova ha diritto a penali per settembre 2026?", "ModaNova ha diritto a penali per luglio 2026?"),  # 0,98
    ("ModaNova ha diritto a penali per settembre 2026?", "TechPoint ha diritto a penali per settembre 2026?"),
    ("Quale vettore ha più danni nel 2026?", "Quale vettore ha meno danni nel 2026?"),                         # 0,94
    ("Qual è il margine per cliente nel 2026?", "Qual è il margine per cliente nel 2025?"),                    # 0,96
    ("Qual è il margine per cliente?", "Qual è il ricavo per cliente?"),
    ("Puntualità mensile per hub", "Puntualità mensile per vettore"),
    ("Tasso di danni per vettore", "Tasso di danni per cliente"),
    ("Qual è il tasso di danni per vettore nel 2026?", "Qual è la puntualità per vettore nel 2026?"),
    ("Top 5 clienti per volume", "Top 3 clienti per volume"),                                               # 0,93
    ("Quali clienti rispettano lo SLA?", "Quali clienti non rispettano lo SLA?"),
    ("Tasso danni di VeloceExpress", "Tasso danni di SudCargo"),  # nomi non presenti nei dati
    ("Qual è il vettore migliore per puntualità?", "Qual è il vettore peggiore per puntualità?"),
]


@pytest.mark.parametrize("a,b", PARAFRASI)
def test_parafrasi_stessa_firma(a, b):
    assert firma(a) == firma(b)
    assert confrontabile(firma(a))


@pytest.mark.parametrize("a,b", DIVERSE)
def test_domande_diverse_firma_diversa(a, b):
    assert firma(a) != firma(b)


def test_contenuto_della_firma():
    f = firma("Tasso di danni di VLX per hub a settembre 2026: i peggiori 3")
    assert f == {"misura:percentuale", "metrica:danni", "entita:vlx", "per:hub", "mese:9", "numero:2026", "direzione:peggio", "numero:3"}


def test_entita_composte_prima_delle_parole():
    """'Picco volumi hub' è un motivo di ritardo: non deve diventare metrica volumi + raggruppamento per hub."""
    assert firma("ritardi per picco volumi hub") == {"metrica:ritardi", "entita:picco volumi hub"}
    assert firma("ritardi da HUB-VR") == {"metrica:ritardi", "entita:hub vr"}


def test_senza_metrica_non_si_cercano_parafrasi():
    assert not confrontabile(firma("come stanno andando le cose?"))
