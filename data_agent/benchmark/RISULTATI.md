# Benchmark del data agent

Generato da `data_agent/benchmark.py` il 2026-10-25 su Darwin arm64, Python 3.12.0, pandas 3.0.6. I dataset più grandi sono **repliche dello storico reale** (12.240 righe copiate N volte con id diversi), non dati nuovi: leggi "Come leggere questi numeri" prima delle conclusioni.
Ogni cella: miglior tempo su 3 esecuzioni (le operazioni di avvio oltre 100.000 righe una sola volta) / picco di memoria allocata durante l'operazione (tracemalloc).

## Avvio del servizio

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Caricamento CSV | 0.023 s / 5 MB | 0.042 s / 8 MB | 0.101 s / 19 MB | 0.196 s / 38 MB | 0.397 s / 76 MB | 0.840 s / 149 MB |
| Validazione colonne e tipi | 0.137 s / 1 MB | 0.266 s / 2 MB | 0.652 s / 6 MB | 1.311 s / 11 MB | 2.615 s / 23 MB | 5.166 s / 46 MB |
| Pulizia dati | 0.287 s / 8 MB | 0.558 s / 17 MB | 1.378 s / 43 MB | 2.790 s / 86 MB | 4.997 s / 171 MB | 11.380 s / 343 MB |

## Analisi (una chiamata di strumento)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Puntualità mensile per cliente | 0.006 s / 1 MB | 0.009 s / 2 MB | 0.021 s / 5 MB | 0.035 s / 9 MB | 0.065 s / 18 MB | 0.115 s / 37 MB |
| Tasso danni per vettore e mese | 0.004 s / 3 MB | 0.007 s / 6 MB | 0.015 s / 17 MB | 0.027 s / 34 MB | 0.055 s / 68 MB | 0.087 s / 135 MB |
| Margine per cliente | 0.002 s / 0 MB | 0.002 s / 1 MB | 0.004 s / 3 MB | 0.006 s / 6 MB | 0.012 s / 12 MB | 0.020 s / 23 MB |
| Spedizioni per motivo di ritardo | 0.001 s / 0 MB | 0.001 s / 1 MB | 0.002 s / 2 MB | 0.003 s / 5 MB | 0.005 s / 10 MB | 0.008 s / 20 MB |
| Verifica SLA mensile (un cliente) | 0.003 s / 0 MB | 0.004 s / 0 MB | 0.007 s / 1 MB | 0.010 s / 1 MB | 0.020 s / 3 MB | 0.031 s / 6 MB |
| Qualifica subvettori | 0.006 s / 3 MB | 0.008 s / 6 MB | 0.016 s / 17 MB | 0.027 s / 34 MB | 0.055 s / 68 MB | 0.089 s / 135 MB |
| Filtro cliente + periodo | 0.002 s / 1 MB | 0.003 s / 2 MB | 0.008 s / 4 MB | 0.013 s / 8 MB | 0.032 s / 15 MB | 0.054 s / 30 MB |

Memoria del DataFrame pulito: 12.240 righe 10 MB, 24.480 righe 20 MB, 61.200 righe 49 MB, 122.400 righe 98 MB, 244.800 righe 197 MB, 489.600 righe 394 MB.

## Memoria effettiva del processo

RSS di picco (memoria assegnata dal sistema operativo, compresi interprete, librerie e frammentazione), misurato in un processo nuovo per ogni dimensione che ripete i passi di avvio del servizio. È il valore da usare per dimensionare il server.

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Processo dopo gli import (Python, pandas, LangChain) | 76 MB | 76 MB | 73 MB | 75 MB | 76 MB | 75 MB |
| Dopo l'avvio: CSV grezzo, report di pulizia, copia e dati preparati dell'agente | 107 MB | 138 MB | 181 MB | 277 MB | 351 MB | 640 MB |
| Dopo le 7 analisi | 110 MB | 139 MB | 195 MB | 277 MB | 357 MB | 640 MB |

## Come leggere questi numeri

- **Dati replicati.** I dataset grandi sono lo storico reale copiato più volte: stessi 10 clienti, 5 vettori e 24 mesi, stesse anomalie in proporzione. I raggruppamenti restano quindi piccoli e i valori molto ripetuti. Con dati reali più vari (più clienti e vettori, più anni, testi più lunghi) tempi e memoria possono essere più alti di quelli misurati qui.
- **Stime indicative.** Le soglie non superate sono stimate con un'estrapolazione lineare dalla dimensione più grande, su una sola macchina e senza altro carico: danno l'ordine di grandezza, non una garanzia. Prima di decidere un cambio di motore vanno rifatte sul server di produzione e, se possibile, con dati reali.
- **Due misure di memoria.** tracemalloc (tabelle sopra) conta le allocazioni Python e numpy di una singola operazione; l'RSS conta tutta la memoria del processo. Per il dimensionamento vale l'RSS.

## Decisione

Soglie: analisi singola 1 s (l'agente ne fa diverse per domanda, oltre il calcolo pesa sulla risposta), avvio 30 s, memoria 1.024 MB. Lo storico attuale ha 12.240 righe.

- Fino a 489.600 righe: nessun caso in cui la singola analisi più lenta supera 1 s (a 489.600 righe: 0.12 s). Stima lineare indicativa: circa **4.250.000 righe**.
- Fino a 489.600 righe: nessun caso in cui l'avvio (caricamento + validazione + pulizia) supera 30 s (a 489.600 righe: 17.39 s). Stima lineare indicativa: circa **840.000 righe**.
- Fino a 489.600 righe: nessun caso in cui la memoria del processo (RSS di picco) supera 1.024 MB (a 489.600 righe: 639.95 MB). Stima lineare indicativa: circa **780.000 righe**.

Cosa introdurre e quando:

1. **Finché nessuna soglia è superata**: pandas in memoria resta la scelta più semplice; la cache delle risposte evita già di rifare le domande ripetute.
2. **Memoria alta** (con questi dati è la prima soglia): il servizio oggi tiene più copie del dataset (CSV grezzo in `main.py`, copia e dati preparati nell'agente). Tenere solo i dati preparati riduce la memoria senza cambiare motore ed è il primo intervento da fare.
3. **Avvio lento ma analisi veloci** (la pulizia domina): salvare il dataset pulito in Parquet e ricaricarlo all'avvio se l'impronta del CSV non è cambiata, invece di ripulirlo ogni volta.
4. **Analisi oltre la soglia o memoria ancora alta**: DuckDB sul file Parquet/CSV. Esegue group by e filtri in colonna, in parallelo e senza caricare tutto in RAM; gli strumenti tipizzati restano gli stessi (cambia solo l'implementazione dei calcoli), quindi nessun SQL scritto dal modello.
5. **SQLite** solo se servono scritture concorrenti (es. dati aggiornati in tempo reale): è un database a righe, per aggregazioni su molte righe è più lento di DuckDB.
