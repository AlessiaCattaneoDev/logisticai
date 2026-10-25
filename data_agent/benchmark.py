"""Benchmark delle analisi più frequenti su dataset di dimensioni crescenti (tempo e memoria).

Serve a decidere con i numeri quando pandas in memoria non basta più e conviene introdurre DuckDB,
SQLite o altre ottimizzazioni. Il dataset si ingrandisce replicando lo storico reale (con id
spedizione diversi): le anomalie restano realistiche, ma clienti, vettori e mesi sono sempre gli
stessi, quindi i risultati sono indicativi (vedi "Come leggere questi numeri" nel report).

Due misure di memoria: tracemalloc per singola operazione e RSS di picco del processo (la memoria
che il sistema operativo assegna davvero), misurato per ogni dimensione in un processo nuovo che
ripete i passi di avvio del servizio.

Uso:  .venv/bin/python benchmark.py                        # fattori 1 2 5 10 20 40, scrive benchmark/RISULTATI.md
      .venv/bin/python benchmark.py --fattori 1 5 --ripetizioni 1
"""
from __future__ import annotations

import argparse
import multiprocessing
import platform
import resource
import sys
import tempfile
import time
import tracemalloc
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd

from cleaning import pulisci_dataset
from dataset import carica_dataset, load_raw, valida_dataset
from kpi import calcola_puntualita, margine, tasso_danni, valuta_subvettori, verifica_sla_mensile
from strumenti import Filtri, _aggregate, _filtra, prepara_dati

SERVICE_DIR = Path(__file__).resolve().parent
CSV = SERVICE_DIR.parent / "data" / "spedizioni.csv"
OUTPUT = SERVICE_DIR / "benchmark" / "RISULTATI.md"
ESCLUSE = ["Meteo avverso", "Destinatario assente", "Indirizzo errato"]

# Soglie di decisione: oltre queste conviene cambiare motore (vedi la sezione "Decisione" del report).
SOGLIA_ANALISI_S = 1.0     # una chiamata di strumento: il loop dell'agente ne fa diverse per domanda
SOGLIA_AVVIO_S = 30.0      # caricamento + validazione + pulizia all'avvio del servizio
SOGLIA_MEMORIA_MB = 1024   # memoria del processo (RSS di picco)


def scala(df_raw: pd.DataFrame, fattore: int) -> pd.DataFrame:
    """Replica lo storico `fattore` volte con id spedizione unici per copia (i duplicati originali restano tali)."""
    copie = []
    for k in range(fattore):
        copia = df_raw.copy()
        if k:
            copia["id_spedizione"] = copia["id_spedizione"] + f"-{k}"
        copie.append(copia)
    return pd.concat(copie, ignore_index=True)


@dataclass
class Misura:
    operazione: str
    fase: str
    righe: int
    secondi: float
    picco_mb: float


@dataclass
class Risultati:
    misure: list[Misura] = field(default_factory=list)
    memoria_df_mb: dict[int, float] = field(default_factory=dict)
    rss_mb: dict[int, dict[str, float]] = field(default_factory=dict)

    def righe(self) -> list[int]:
        return sorted({m.righe for m in self.misure})

    def get(self, operazione: str, righe: int) -> Misura:
        return next(m for m in self.misure if m.operazione == operazione and m.righe == righe)


def _misura(fn: Callable[[], object], ripetizioni: int) -> tuple[float, float]:
    """Miglior tempo su `ripetizioni` esecuzioni e picco di memoria (tracemalloc, in un'esecuzione a parte)."""
    tempi = []
    for _ in range(ripetizioni):
        t0 = time.perf_counter()
        fn()
        tempi.append(time.perf_counter() - t0)
    tracemalloc.start()
    try:
        fn()
        _, picco = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    return min(tempi), picco / 1024 / 1024


def analisi(dati: pd.DataFrame) -> dict[str, Callable[[], object]]:
    """Le analisi che l'agente esegue più spesso (stesse funzioni degli strumenti)."""
    tutto = Filtri()
    return {
        "Puntualità mensile per cliente": lambda: calcola_puntualita(_filtra(dati, tutto), ESCLUSE, ["cliente", "mese_previsto"]),
        "Tasso danni per vettore e mese": lambda: tasso_danni(dati, ["vettore", "mese_previsto"]),
        "Margine per cliente": lambda: margine(dati, ["cliente"]),
        "Spedizioni per motivo di ritardo": lambda: _aggregate(dati, ["motivo_ritardo"], spedizioni=("id_spedizione", "size")),
        "Verifica SLA mensile (un cliente)": lambda: verifica_sla_mensile(dati, "ModaNova", "2026-09", 0.95, 1000, 5000, 50, ESCLUSE),
        "Qualifica subvettori": lambda: valuta_subvettori(dati, 0.02, 0.03, 2),
        "Filtro cliente + periodo": lambda: _filtra(dati, Filtri(filtri={"cliente": ["ModaNova"]}, da_mese="2026-01", a_mese="2026-06")),
    }


def _rss_picco_mb() -> float:
    picco = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return picco / 1024 / 1024 if sys.platform == "darwin" else picco / 1024  # macOS in byte, Linux in KB


def processo_servizio(path: str) -> dict[str, float]:
    """Gira in un processo nuovo: stessi passi di main.create_app e di DataAnalyst, poi le analisi.

    Restituisce l'RSS di picco dopo gli import, dopo l'avvio e dopo le analisi.
    """
    rss = {"import": _rss_picco_mb()}
    df_raw, _ = carica_dataset(path)
    pulisci_dataset(df_raw)                                   # report di qualità calcolato all'avvio
    dati = prepara_dati(pulisci_dataset(df_raw.copy())[0])    # copia e dati preparati del DataAnalyst
    rss["avvio"] = _rss_picco_mb()
    for fn in analisi(dati).values():
        fn()
    rss["analisi"] = _rss_picco_mb()
    return rss


def misura_processo(path: Path) -> dict[str, float]:
    with multiprocessing.get_context("spawn").Pool(1) as pool:
        return pool.apply(processo_servizio, (str(path),))


def esegui(df_raw: pd.DataFrame, fattori: list[int], ripetizioni: int = 3, log: Callable[[str], None] = print) -> Risultati:
    ris = Risultati()
    with tempfile.TemporaryDirectory() as tmp:
        for fattore in fattori:
            grezzo = scala(df_raw, fattore)
            n = len(grezzo)
            path = Path(tmp) / f"spedizioni_x{fattore}.csv"
            grezzo.to_csv(path, index=False)
            log(f"{n:>9,} righe (x{fattore})".replace(",", "."))
            # Avvio: una sola ripetizione oltre le 100 mila righe (sono le operazioni più lente).
            rip_avvio = ripetizioni if n <= 100_000 else 1
            avvio = {
                "Caricamento CSV": lambda: load_raw(path),
                "Validazione colonne e tipi": lambda: valida_dataset(grezzo),
                "Pulizia dati": lambda: pulisci_dataset(grezzo),
            }
            for nome, fn in avvio.items():
                ris.misure.append(Misura(nome, "avvio", n, *_misura(fn, rip_avvio)))
            dati = prepara_dati(pulisci_dataset(grezzo)[0])
            ris.memoria_df_mb[n] = dati.memory_usage(deep=True).sum() / 1024 / 1024
            for nome, fn in analisi(dati).items():
                ris.misure.append(Misura(nome, "analisi", n, *_misura(fn, ripetizioni)))
            ris.rss_mb[n] = misura_processo(path)
    return ris


def _fmt_n(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def _cella(m: Misura) -> str:
    return f"{m.secondi:.3f} s / {_fmt_n(round(m.picco_mb))} MB"


def decisione(ris: Risultati) -> list[str]:
    """Per ogni soglia: la prima dimensione misurata che la supera, altrimenti una stima lineare di quando succederà.

    Tempi e memoria misurati crescono in modo lineare con le righe: la stima usa il rapporto della dimensione più grande.
    """
    righe = ris.righe()
    massimo = righe[-1]
    analisi = lambda n: max(m.secondi for m in ris.misure if m.righe == n and m.fase == "analisi")  # noqa: E731
    avvio = lambda n: sum(m.secondi for m in ris.misure if m.righe == n and m.fase == "avvio")  # noqa: E731
    # Memoria: RSS di picco del processo se misurato (è quella che conta per il server), altrimenti tracemalloc.
    memoria = lambda n: ris.rss_mb[n]["analisi"] if n in ris.rss_mb else max(  # noqa: E731
        [m.picco_mb for m in ris.misure if m.righe == n] + [ris.memoria_df_mb.get(n, 0)])
    controlli = [
        (f"la singola analisi più lenta supera {SOGLIA_ANALISI_S:g} s", analisi, SOGLIA_ANALISI_S, "s"),
        (f"l'avvio (caricamento + validazione + pulizia) supera {SOGLIA_AVVIO_S:g} s", avvio, SOGLIA_AVVIO_S, "s"),
        (f"la memoria del processo (RSS di picco) supera {_fmt_n(SOGLIA_MEMORIA_MB)} MB", memoria, SOGLIA_MEMORIA_MB, "MB"),
    ]
    out = []
    for descrizione, valore, soglia, unita in controlli:
        oltre = next((n for n in righe if valore(n) > soglia), None)
        if oltre is not None:
            out.append(f"- **Da {_fmt_n(oltre)} righe** {descrizione}.")
        else:
            stima = int(massimo * soglia / valore(massimo)) if valore(massimo) > 0 else 0
            out.append(f"- Fino a {_fmt_n(massimo)} righe: nessun caso in cui {descrizione} "
                       f"(a {_fmt_n(massimo)} righe: {valore(massimo):.2f} {unita}). Stima lineare indicativa: circa **{_fmt_n(round(stima, -4))} righe**.")
    return out


def report_markdown(ris: Risultati, ripetizioni: int) -> str:
    righe = ris.righe()
    header = "| Operazione | " + " | ".join(f"{_fmt_n(n)} righe" for n in righe) + " |"
    sep = "|---|" + "---:|" * len(righe)
    out = [
        "# Benchmark del data agent",
        "",
        f"Generato da `data_agent/benchmark.py` il {date.today().isoformat()} su {platform.system()} {platform.machine()}, "
        f"Python {platform.python_version()}, pandas {pd.__version__}. I dataset più grandi sono **repliche dello storico reale** "
        "(12.240 righe copiate N volte con id diversi), non dati nuovi: leggi \"Come leggere questi numeri\" prima delle conclusioni.",
        f"Ogni cella: miglior tempo su {ripetizioni} esecuzioni (le operazioni di avvio oltre 100.000 righe una sola volta) / "
        "picco di memoria allocata durante l'operazione (tracemalloc).",
        "",
    ]
    for fase, titolo in [("avvio", "Avvio del servizio"), ("analisi", "Analisi (una chiamata di strumento)")]:
        out += [f"## {titolo}", "", header, sep]
        nomi = list(dict.fromkeys(m.operazione for m in ris.misure if m.fase == fase))
        for nome in nomi:
            out.append(f"| {nome} | " + " | ".join(_cella(ris.get(nome, n)) for n in righe) + " |")
        out.append("")
    out += ["Memoria del DataFrame pulito: " + ", ".join(f"{_fmt_n(n)} righe {_fmt_n(round(mb))} MB" for n, mb in sorted(ris.memoria_df_mb.items())) + ".", ""]
    if ris.rss_mb:
        fasi = [("import", "Processo dopo gli import (Python, pandas, LangChain)"),
                ("avvio", "Dopo l'avvio: CSV grezzo, report di pulizia, copia e dati preparati dell'agente"),
                ("analisi", "Dopo le 7 analisi")]
        out += ["## Memoria effettiva del processo", "",
                "RSS di picco (memoria assegnata dal sistema operativo, compresi interprete, librerie e frammentazione), "
                "misurato in un processo nuovo per ogni dimensione che ripete i passi di avvio del servizio. "
                "È il valore da usare per dimensionare il server.", "", header, sep]
        for chiave, nome in fasi:
            out.append(f"| {nome} | " + " | ".join(f"{_fmt_n(round(ris.rss_mb[n][chiave]))} MB" for n in righe) + " |")
        out.append("")
    out += [
        "## Come leggere questi numeri",
        "",
        "- **Dati replicati.** I dataset grandi sono lo storico reale copiato più volte: stessi 10 clienti, 5 vettori e 24 mesi, "
        "stesse anomalie in proporzione. I raggruppamenti restano quindi piccoli e i valori molto ripetuti. Con dati reali "
        "più vari (più clienti e vettori, più anni, testi più lunghi) tempi e memoria possono essere più alti di quelli misurati qui.",
        "- **Stime indicative.** Le soglie non superate sono stimate con un'estrapolazione lineare dalla dimensione più grande, "
        "su una sola macchina e senza altro carico: danno l'ordine di grandezza, non una garanzia. Prima di decidere un cambio "
        "di motore vanno rifatte sul server di produzione e, se possibile, con dati reali.",
        "- **Due misure di memoria.** tracemalloc (tabelle sopra) conta le allocazioni Python e numpy di una singola operazione; "
        "l'RSS conta tutta la memoria del processo. Per il dimensionamento vale l'RSS.",
        "",
    ]
    out += [
        "## Decisione",
        "",
        f"Soglie: analisi singola {SOGLIA_ANALISI_S:g} s (l'agente ne fa diverse per domanda, oltre il calcolo pesa sulla risposta), "
        f"avvio {SOGLIA_AVVIO_S:g} s, memoria {_fmt_n(SOGLIA_MEMORIA_MB)} MB. Lo storico attuale ha 12.240 righe.",
        "",
        *decisione(ris),
        "",
        "Cosa introdurre e quando:",
        "",
        "1. **Finché nessuna soglia è superata**: pandas in memoria resta la scelta più semplice; la cache delle risposte "
        "evita già di rifare le domande ripetute.",
        "2. **Memoria alta** (con questi dati è la prima soglia): il servizio oggi tiene più copie del dataset (CSV grezzo "
        "in `main.py`, copia e dati preparati nell'agente). Tenere solo i dati preparati riduce la memoria senza cambiare "
        "motore ed è il primo intervento da fare.",
        "3. **Avvio lento ma analisi veloci** (la pulizia domina): salvare il dataset pulito in Parquet e ricaricarlo "
        "all'avvio se l'impronta del CSV non è cambiata, invece di ripulirlo ogni volta.",
        "4. **Analisi oltre la soglia o memoria ancora alta**: DuckDB sul file Parquet/CSV. Esegue group by e filtri in colonna, "
        "in parallelo e senza caricare tutto in RAM; gli strumenti tipizzati restano gli stessi (cambia solo l'implementazione "
        "dei calcoli), quindi nessun SQL scritto dal modello.",
        "5. **SQLite** solo se servono scritture concorrenti (es. dati aggiornati in tempo reale): è un database a righe, "
        "per aggregazioni su molte righe è più lento di DuckDB.",
        "",
    ]
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fattori", type=int, nargs="+", default=[1, 2, 5, 10, 20, 40])
    parser.add_argument("--ripetizioni", type=int, default=3)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    ris = esegui(load_raw(CSV), args.fattori, args.ripetizioni)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report_markdown(ris, args.ripetizioni), encoding="utf-8")
    print(f"Report scritto in {args.output}")


if __name__ == "__main__":
    main()
