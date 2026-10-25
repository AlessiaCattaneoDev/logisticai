"""Firma di una domanda: cosa chiede, ridotto a elementi confrontabili.

Serve alla cache per riconoscere le parafrasi senza confondere domande diverse. La similarità degli
embedding da sola non basta: misurata con text-embedding-3-small, le parafrasi vere stanno tra 0,65 e
0,88, mentre "penali ModaNova a settembre" / "a luglio" vale 0,976 e "più danni" / "meno danni" 0,941.

La firma contiene:
- metrica, raggruppamento, tipo di misura e direzione, con i sinonimi ricondotti a una sola voce
  ("guadagno" = margine, "ogni cliente" = per cliente, "cause" = motivi);
- i valori dei dati citati (clienti, vettori, hub, servizi, ...), i mesi e tutti i numeri (anni, top N);
- OGNI altra parola che il lessico non conosce, così com'è (es. "non", un nome che non è nei dati).

Due domande condividono la risposta solo con firma identica: in caso di dubbio si rifà l'analisi.
Il lessico si estende aggiungendo sinonimi o parole neutre, mai abbassando la soglia.
"""
from __future__ import annotations

import re
from collections.abc import Iterable

# Gruppo -> prefissi delle parole (testo normalizzato: minuscolo, senza accenti).
METRICHE = {
    "margine": ["margin", "guadagn", "profitt", "redditiv"],
    "ricavi": ["ricav", "fatturat", "incass"],
    "costi": ["cost", "spes"],
    "danni": ["dann", "rott", "avari"],
    "puntualita": ["puntual"],
    "ritardi": ["ritard"],
    "penali": ["penal", "sla"],
    "giacenze": ["giacenz", "tentativ"],
    "reclami": ["reclam", "rimbors", "risarc"],
    "volumi": ["volum", "quantit"],
    "peso": ["peso", "pesi", "kg", "chil"],
    "qualifica": ["sospe", "qualific"],
    "resa": ["resa", "rese"],
}
DIMENSIONI = {
    "cliente": ["client"],
    "vettore": ["vettor", "corrier", "trasportator", "subvettor"],
    "hub": ["hub", "magazzin", "deposit"],
    "regione": ["region"],
    "area": ["area", "aree", "zona", "zone"],
    "servizio": ["serviz"],
    "mese": ["mese", "mesi", "mensil"],
    "anno": ["anno", "anni", "annual"],
    "trimestre": ["trimestr"],
    "settimana": ["settiman"],
    "motivo": ["motiv", "caus", "ragion", "perche"],
    "destinatario": ["destinatar"],
    "andamento": ["andament", "trend", "evoluz"],
}
MISURE = {
    "media": ["medi"],
    "totale": ["total", "somm", "complessiv"],
    "percentuale": ["percentual", "tasso", "tassi", "quota"],
}
DIREZIONI = {
    "alto": ["piu", "maggior", "massim", "elevat", "top"],
    "basso": ["meno", "minor", "minim"],
    "meglio": ["miglior"],
    "peggio": ["peggior", "critic"],
    "ultimi": ["ultim"],
    "primi": ["prim"],
}
MESI = {nome: i + 1 for i, nome in enumerate(
    ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"])}
MESI.update({nome[:3]: n for nome, n in list(MESI.items())})

# Parole che non cambiano la domanda (articoli, preposizioni, verbi di richiesta). "non" NON è qui: cambia il senso.
NEUTRE = set("""
il lo la i gli le l un uno una un di a da in con su per tra fra del dello della dei degli delle al allo alla ai agli
alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi e ed o
oppure ma che chi cosa cos quale quali qual quanto quanta quanti quante come dove quando sono e sia siano ha hanno
abbiamo ho c ci ce mi ti si ne fa fanno fatto mostra mostrami mostrare fammi fai fare dammi dimmi dire vedere vedi
voglio vorrei puoi potresti calcola calcolami calcolare analizza analizzami dato dati valore valori numero numeri ogni
ciascun ciascuno ciascuna tutti tutte tutto tutta nostro nostri nostra nostre noi loro suo sua suoi grafico grafici
tabella tabelle elenco lista classifica spedizione spedizioni consegna consegne arrivano arriva arrivare dobbiamo
devo deve pagare paghiamo diritto spetta spettano frequente frequenti spesso volte caso casi periodo storico padana
logistics azienda rispetto circa anche solo invece poi quindi ora gia ancora stati stato andato vanno va ordinati
ordina ordinato dettaglio confronto confronta singolo singola
""".split())


def _gruppo(token: str, lessico: dict[str, list[str]]) -> str | None:
    return next((g for g, prefissi in lessico.items() if any(token.startswith(p) for p in prefissi)), None)


def calcola_firma(testo_normalizzato: str, entita: Iterable[str] = ()) -> frozenset[str]:
    """Firma di un testo già normalizzato (cache.normalizza). `entita`: valori dei dati, anch'essi normalizzati."""
    testo = f" {testo_normalizzato} "
    elementi: set[str] = set()
    for ent in sorted(set(entita), key=len, reverse=True):  # prima i nomi lunghi ("picco volumi hub" prima di "hub")
        if ent and f" {ent} " in testo:
            elementi.add(f"entita:{ent}")
            testo = testo.replace(f" {ent} ", " ")
    for token in testo.split():
        if token.isdigit():
            elementi.add(f"numero:{int(token)}")
        elif token in MESI:
            elementi.add(f"mese:{MESI[token]}")
        elif token in NEUTRE:
            continue
        elif g := _gruppo(token, METRICHE):
            elementi.add(f"metrica:{g}")
        elif g := _gruppo(token, DIMENSIONI):
            elementi.add(f"per:{g}")
        elif g := _gruppo(token, MISURE):
            elementi.add(f"misura:{g}")
        elif g := _gruppo(token, DIREZIONI):
            elementi.add(f"direzione:{g}")
        else:
            elementi.add(f"parola:{token}")
    return frozenset(elementi)


def confrontabile(firma: frozenset[str]) -> bool:
    """Si cercano parafrasi solo se la domanda nomina almeno una metrica riconosciuta."""
    return any(e.startswith("metrica:") for e in firma)
