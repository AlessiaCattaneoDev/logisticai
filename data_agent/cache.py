"""Cache delle analisi: la stessa domanda, anche riformulata, non richiama il modello.

Un'analisi costa più chiamate LLM e decine di secondi, mentre lo storico è in sola lettura: la stessa
domanda con le stesse regole dà la stessa risposta. Due livelli:

1. Uguale: stessa richiesta a meno di maiuscole, accenti, punteggiatura e spazi (chiave esatta).
2. Parafrasi: "margine per cliente nel 2026" / "quanto guadagniamo su ogni cliente nel 2026".
   Si riusa la risposta solo se (a) regole, richiesta di grafico e CSV sono gli stessi, (b) la firma
   della domanda (firma.py: metrica, raggruppamento, dati citati, mesi, numeri, direzione, parole non
   riconosciute) è IDENTICA e (c) la similarità degli embedding supera la soglia. La firma decide:
   gli embedding da soli scambierebbero "settembre" con "luglio" (similarità 0,976).

Se l'embedding non è configurato o fallisce resta solo il livello 1. Con scadenza (TTL), limite di
voci (LRU) e impronta del CSV nella chiave (se il file cambia le risposte vecchie non valgono più).
Limite: è in memoria, si svuota a ogni riavvio e non è condivisa tra più istanze (per persisterla:
SQLite o Redis).
"""
from __future__ import annotations

import copy
import hashlib
import math
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from firma import calcola_firma, confrontabile


def normalizza(testo: str | None) -> str:
    if not testo:
        return ""
    senza_accenti = "".join(c for c in unicodedata.normalize("NFKD", testo.lower()) if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w%€]+", " ", senza_accenti).split())


def impronta_file(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blocco in iter(lambda: f.read(1 << 20), b""):
            h.update(blocco)
    return h.hexdigest()[:16]


Embedder = Callable[[str], list[float]]


@dataclass
class Ricerca:
    """Esito di una ricerca in cache; se è un miss si passa a `salva` per non ricalcolare l'embedding."""

    chiave: str
    contesto: str
    firma: frozenset[str]
    valore: dict | None = None
    tipo: str | None = None                # "uguale" | "parafrasi"
    domanda_originale: str | None = None
    similarita: float | None = None
    vettore: list[float] | None = None
    embedding_ms: int | None = None        # presente se è stato chiamato il modello di embedding


@dataclass
class _Voce:
    creata: float
    valore: dict
    contesto: str
    firma: frozenset[str]
    vettore: list[float] | None
    domanda: str


def _coseno(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    den = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return num / den if den else 0.0


class CacheAnalisi:
    def __init__(self, max_voci: int = 256, ttl_s: float = 3600, impronta_dati: str = "", *,
                 embedder: Embedder | None = None, soglia: float = 0.6, entita: Iterable[str] | Mapping[str, str] = (),
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.max_voci = max_voci
        self.ttl_s = ttl_s
        self.impronta_dati = impronta_dati
        self.embedder = embedder
        self.soglia = soglia
        mappa = dict(entita) if isinstance(entita, Mapping) else {e: e for e in entita}
        self.entita = {normalizza(alias): normalizza(nome) for alias, nome in mappa.items()}
        self._clock = clock
        self._voci: OrderedDict[str, _Voce] = OrderedDict()
        self._lock = threading.Lock()
        self.hit_uguali = 0
        self.hit_parafrasi = 0
        self.miss = 0

    @property
    def attiva(self) -> bool:
        return self.max_voci > 0 and self.ttl_s > 0

    def _contesto(self, genera_grafico: bool, regole: str | None) -> str:
        return "\x1f".join([self.impronta_dati, "grafico" if genera_grafico else "", normalizza(regole)])

    def chiave(self, domanda: str, genera_grafico: bool, regole: str | None) -> str:
        return hashlib.sha256(f"{self._contesto(genera_grafico, regole)}\x1f{normalizza(domanda)}".encode()).hexdigest()

    def firma(self, domanda: str) -> frozenset[str]:
        return calcola_firma(normalizza(domanda), self.entita)

    def _valida(self, voce: _Voce | None) -> bool:
        return voce is not None and self._clock() - voce.creata < self.ttl_s

    def cerca(self, domanda: str, genera_grafico: bool, regole: str | None) -> Ricerca:
        r = Ricerca(self.chiave(domanda, genera_grafico, regole), self._contesto(genera_grafico, regole), self.firma(domanda))
        if not self.attiva:
            return r
        with self._lock:
            voce = self._voci.get(r.chiave)
            if self._valida(voce):
                self._voci.move_to_end(r.chiave)
                self.hit_uguali += 1
                r.valore, r.tipo, r.domanda_originale = copy.deepcopy(voce.valore), "uguale", voce.domanda
                return r
            candidati = [(k, v) for k, v in self._voci.items() if v.contesto == r.contesto and v.firma == r.firma and v.vettore and self._valida(v)]
        if self.embedder and confrontabile(r.firma):
            # Embedding calcolato anche senza candidati: serve a salvare la voce per le parafrasi future.
            t0 = time.perf_counter()
            try:
                r.vettore = list(self.embedder(normalizza(domanda)))
            except Exception:  # embedding non disponibile: resta la cache esatta
                r.vettore = None
            r.embedding_ms = int((time.perf_counter() - t0) * 1000)
        if r.vettore and candidati:
            sim, chiave, voce = max(((_coseno(r.vettore, v.vettore), k, v) for k, v in candidati), key=lambda t: t[0])
            if sim >= self.soglia:
                with self._lock:
                    if chiave in self._voci:
                        self._voci.move_to_end(chiave)
                    self.hit_parafrasi += 1
                r.valore, r.tipo, r.domanda_originale, r.similarita = copy.deepcopy(voce.valore), "parafrasi", voce.domanda, round(sim, 3)
                return r
        with self._lock:
            self.miss += 1
        return r

    def salva(self, ricerca: Ricerca, domanda: str, valore: dict[str, Any]) -> None:
        if not self.attiva:
            return
        with self._lock:
            self._voci[ricerca.chiave] = _Voce(self._clock(), copy.deepcopy(valore), ricerca.contesto, ricerca.firma, ricerca.vettore, domanda)
            self._voci.move_to_end(ricerca.chiave)
            while len(self._voci) > self.max_voci:
                self._voci.popitem(last=False)

    def stato(self) -> dict:
        with self._lock:
            return {"attiva": self.attiva, "parafrasi": self.embedder is not None, "voci": len(self._voci),
                    "hit_uguali": self.hit_uguali, "hit_parafrasi": self.hit_parafrasi, "miss": self.miss,
                    "ttl_s": self.ttl_s, "soglia": self.soglia}
