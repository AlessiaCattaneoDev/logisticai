"""Cache delle analisi: domande uguali o quasi uguali non richiamano il modello.

Un'analisi costa più chiamate LLM e decine di secondi, mentre lo storico è in sola lettura: la stessa
domanda con le stesse regole dà la stessa risposta. La chiave è la richiesta normalizzata (maiuscole,
accenti, punteggiatura e spazi non contano) più l'impronta del CSV, così se il file cambia le
risposte vecchie non vengono più usate. In memoria, con scadenza (TTL) e limite di voci (LRU).
"""
from __future__ import annotations

import copy
import hashlib
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import Any


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


class CacheAnalisi:
    def __init__(self, max_voci: int = 256, ttl_s: float = 3600, impronta_dati: str = "", clock: Callable[[], float] = time.monotonic) -> None:
        self.max_voci = max_voci
        self.ttl_s = ttl_s
        self.impronta_dati = impronta_dati
        self._clock = clock
        self._voci: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = threading.Lock()
        self.hit = 0
        self.miss = 0

    @property
    def attiva(self) -> bool:
        return self.max_voci > 0 and self.ttl_s > 0

    def chiave(self, domanda: str, genera_grafico: bool, regole: str | None) -> str:
        parti = [self.impronta_dati, normalizza(domanda), "grafico" if genera_grafico else "", normalizza(regole)]
        return hashlib.sha256("\x1f".join(parti).encode()).hexdigest()

    def get(self, chiave: str) -> dict | None:
        if not self.attiva:
            return None
        with self._lock:
            voce = self._voci.get(chiave)
            if voce and self._clock() - voce[0] < self.ttl_s:
                self._voci.move_to_end(chiave)
                self.hit += 1
                return copy.deepcopy(voce[1])
            if voce:
                del self._voci[chiave]
            self.miss += 1
            return None

    def put(self, chiave: str, valore: dict[str, Any]) -> None:
        if not self.attiva:
            return
        with self._lock:
            self._voci[chiave] = (self._clock(), copy.deepcopy(valore))
            self._voci.move_to_end(chiave)
            while len(self._voci) > self.max_voci:
                self._voci.popitem(last=False)

    def stato(self) -> dict:
        with self._lock:
            return {"attiva": self.attiva, "voci": len(self._voci), "hit": self.hit, "miss": self.miss, "ttl_s": self.ttl_s}
