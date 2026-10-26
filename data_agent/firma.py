"""Firma di una domanda: cosa chiede, ridotto a elementi confrontabili.

Serve alla cache per riconoscere le parafrasi senza confondere domande diverse. La similarità degli
embedding da sola non basta: misurata con text-embedding-3-small, le parafrasi vere stanno tra 0,65 e
0,88, mentre "penali ModaNova a settembre" / "a luglio" vale 0,976 e "più danni" / "meno danni" 0,941.

La firma contiene:
- metrica, raggruppamento, tipo di misura e direzione, con i sinonimi ricondotti a una sola voce
  ("guadagno" = margine, "ogni cliente" = per cliente, "cause" = motivi);
- i valori dei dati citati (clienti, vettori, hub, servizi, ...), i mesi e tutti i numeri (anni, top N);
- OGNI altra parola che il lessico non conosce, così com'è (es. "non", un nome che non è nei dati);
- con due o più raggruppamenti non temporali, il loro ordine ("vettori per hub" non è "hub per vettore").

Due domande condividono la risposta solo con firma identica: in caso di dubbio si rifà l'analisi.
Il lessico si estende aggiungendo sinonimi o parole neutre, mai abbassando la soglia.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping

# Gruppo -> prefissi delle parole (testo normalizzato: minuscolo, senza accenti).
METRICHE = {
    "margine": ["margin", "guadagn", "profitt", "redditiv", "perdit", "perdiam"],
    "ricavi": ["ricav", "fattur", "incass"],
    "costi": ["cost", "spes", "spend"],
    "danni": ["dann", "rott", "avari"],
    "puntualita": ["puntual"],
    "ritardi": ["ritard", "tardi"],
    "penali": ["penal", "sla"],
    "giacenze": ["giacenz", "tentativ"],
    "reclami": ["reclam", "rimbors", "risarc"],
    "volumi": ["volum", "quantit"],
    "peso": ["peso", "pesi", "pesa", "kg", "chil"],
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
    # "andamento" e "trend" sono serie nel tempo: nello storico si leggono mese per mese.
    "mese": ["mese", "mesi", "mensil", "andament", "trend", "evoluz"],
    "anno": ["anno", "anni", "annual"],
    "trimestre": ["trimestr"],
    "settimana": ["settiman"],
    "motivo": ["motiv", "caus", "ragion", "perche"],
    "destinatario": ["destinatar"],
}
MISURE = {
    "media": ["medi"],
    "totale": ["total", "somm", "complessiv"],
    "percentuale": ["percentual", "tasso", "tassi", "quota"],
    "verifica": ["rispett", "conform"],
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
il lo la i gli le l un uno una un di a ad ed da in con su per tra fra del dello della dei degli delle al allo alla ai agli
alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi e ed o
oppure ma che chi cosa cos quale quali qual quanto quanta quanti quante come dove quando sono e sia siano ha hanno
abbiamo ho c ci ce mi ti si ne fa fanno fatto mostra mostrami mostrare fammi fai fare dammi dimmi dire vedere vedi
voglio vorrei puoi potresti calcola calcolami calcolare analizza analizzami dato dati valore valori numero numeri ogni
ciascun ciascuno ciascuna tutti tutte tutto tutta nostro nostri nostra nostre noi loro suo sua suoi grafico grafici
tabella tabelle elenco lista classifica spedizione spedizioni consegna consegne arrivano arriva arrivare dobbiamo
devo deve pagare paghiamo diritto spetta spettano frequente frequenti spesso volte caso casi periodo storico padana
logistics azienda circa anche solo invece poi quindi ora gia ancora stati stato state andato vanno va ordinati
ordina ordinato dettaglio confronto confronta singolo singola avuto avere avuta avute ammonta ammontano importo
importi com dell dall nell sull all cui soldi esito servono serve occorrono procedura qualche andrebbe andrebbero
mostri mostrate sapere conoscere calcolarmi dirmi indicami elencami arrivate arrivati trasporto
""".split())
# Raggruppamenti di cui l'ordine non conta: il tempo ("puntualità mensile per hub" = "per hub mese per mese")
# e i motivi ("motivi di ritardo per area" = "per area, perché arrivano in ritardo").
SENZA_ORDINE = {"mese", "anno", "trimestre", "settimana", "motivo"}


def _gruppo(token: str, lessico: dict[str, list[str]]) -> str | None:
    return next((g for g, prefissi in lessico.items() if any(token.startswith(p) for p in prefissi)), None)


def calcola_firma(testo_normalizzato: str, entita: Iterable[str] | Mapping[str, str] = ()) -> frozenset[str]:
    """Firma di un testo già normalizzato (cache.normalizza).

    `entita`: valori dei dati normalizzati, oppure mappa alias -> nome ("casaviva" -> "casaviva arredo").
    """
    mappa = dict(entita) if isinstance(entita, Mapping) else {e: e for e in entita}
    # "secondo la procedura" non è un ordinale ("secondo trimestre" invece sì).
    testo = re.sub(r" secondo (la|il|lo|le|i|gli) ", " ", f" {testo_normalizzato} ")
    elementi: set[str] = set()
    ordine: list[str] = []
    for alias in sorted(mappa, key=len, reverse=True):  # prima i nomi lunghi ("picco volumi hub" prima di "hub")
        if alias and f" {alias} " in testo:
            elementi.add(f"entita:{mappa[alias]}")
            # "il servizio Express 24h" = "l'Express 24h": la parola prima del nome è un'etichetta, non un raggruppamento.
            testo = re.sub(rf" (\w+) {re.escape(alias)} ", lambda m: " " if _gruppo(m.group(1), DIMENSIONI) else f" {m.group(1)} ", testo)
            testo = testo.replace(f" {alias} ", " ")
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
            if g not in SENZA_ORDINE and g not in ordine:
                ordine.append(g)
        elif g := _gruppo(token, MISURE):
            elementi.add(f"misura:{g}")
        elif g := _gruppo(token, DIREZIONI):
            elementi.add(f"direzione:{g}")
        else:
            elementi.add(f"parola:{token}")
    if len(ordine) > 1:
        # "danni dei vettori per hub" e "danni degli hub per vettore" non sono la stessa domanda.
        elementi.add("ordine:" + ">".join(ordine))
    return frozenset(elementi)


def confrontabile(firma: frozenset[str]) -> bool:
    """Si cercano parafrasi solo se la domanda dice cosa misurare: una metrica riconosciuta, oppure un
    valore dei dati con un raggruppamento ("spedizioni Smarrita per vettore"). Domande vaghe: solo cache esatta."""
    tipi = {e.split(":")[0] for e in firma}
    return "metrica" in tipi or {"entita", "per"} <= tipi
