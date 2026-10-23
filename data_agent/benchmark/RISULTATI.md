# Benchmark del data agent

Generato da `data_agent/benchmark.py` il 2026-10-23 su Darwin arm64, Python 3.12.0, pandas 3.0.6. Il dataset si ingrandisce replicando lo storico reale.
Ogni cella: miglior tempo su 3 esecuzioni (le operazioni di avvio oltre 100.000 righe una sola volta) / picco di memoria allocata durante l'operazione (tracemalloc).

## Avvio del servizio

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Caricamento CSV | 0.023 s / 5 MB | 0.045 s / 8 MB | 0.089 s / 19 MB | 0.180 s / 38 MB | 0.369 s / 76 MB | 0.771 s / 149 MB |
| Validazione colonne e tipi | 0.124 s / 1 MB | 0.248 s / 2 MB | 0.589 s / 6 MB | 1.166 s / 11 MB | 2.344 s / 23 MB | 4.753 s / 46 MB |
| Pulizia dati | 0.262 s / 8 MB | 0.569 s / 17 MB | 1.256 s / 43 MB | 2.541 s / 86 MB | 5.554 s / 171 MB | 10.484 s / 343 MB |

## Analisi (una chiamata di strumento)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Puntualità mensile per cliente | 0.005 s / 1 MB | 0.008 s / 2 MB | 0.018 s / 5 MB | 0.031 s / 9 MB | 0.059 s / 18 MB | 0.124 s / 37 MB |
| Tasso danni per vettore e mese | 0.003 s / 3 MB | 0.006 s / 6 MB | 0.012 s / 17 MB | 0.025 s / 34 MB | 0.043 s / 68 MB | 0.083 s / 135 MB |
| Margine per cliente | 0.002 s / 0 MB | 0.002 s / 1 MB | 0.003 s / 3 MB | 0.006 s / 6 MB | 0.010 s / 12 MB | 0.019 s / 23 MB |
| Spedizioni per motivo di ritardo | 0.001 s / 0 MB | 0.001 s / 1 MB | 0.002 s / 2 MB | 0.002 s / 5 MB | 0.004 s / 10 MB | 0.007 s / 20 MB |
| Verifica SLA mensile (un cliente) | 0.003 s / 0 MB | 0.004 s / 0 MB | 0.006 s / 1 MB | 0.009 s / 1 MB | 0.016 s / 3 MB | 0.030 s / 6 MB |
| Qualifica subvettori | 0.005 s / 3 MB | 0.007 s / 6 MB | 0.013 s / 17 MB | 0.025 s / 34 MB | 0.044 s / 68 MB | 0.084 s / 135 MB |
| Filtro cliente + periodo | 0.002 s / 1 MB | 0.003 s / 2 MB | 0.007 s / 4 MB | 0.014 s / 8 MB | 0.027 s / 15 MB | 0.057 s / 30 MB |

Memoria del DataFrame pulito: 12.240 righe 10 MB, 24.480 righe 20 MB, 61.200 righe 49 MB, 122.400 righe 98 MB, 244.800 righe 197 MB, 489.600 righe 394 MB.

## Decisione

Soglie: analisi singola 1 s (l'agente ne fa diverse per domanda, oltre il calcolo pesa sulla risposta), avvio 30 s, memoria 1.024 MB. Lo storico attuale ha 12.240 righe.

- Fino a 489.600 righe: nessun caso in cui la singola analisi più lenta supera 1 s (a 489.600 righe: 0.12 s). Stima lineare: circa **3.950.000 righe**.
- Fino a 489.600 righe: nessun caso in cui l'avvio (caricamento + validazione + pulizia) supera 30 s (a 489.600 righe: 16.01 s). Stima lineare: circa **920.000 righe**.
- Fino a 489.600 righe: nessun caso in cui la memoria (picco di un'operazione o DataFrame pulito) supera 1.024 MB (a 489.600 righe: 394.17 MB). Stima lineare: circa **1.270.000 righe**.

Cosa introdurre e quando:

1. **Finché nessuna soglia è superata**: pandas in memoria resta la scelta più semplice; la cache delle risposte evita già di rifare le domande ripetute.
2. **Avvio lento ma analisi veloci** (la pulizia domina): salvare il dataset pulito in Parquet e ricaricarlo all'avvio se l'impronta del CSV non è cambiata, invece di ripulirlo ogni volta.
3. **Analisi oltre la soglia o memoria alta**: DuckDB sul file Parquet/CSV. Esegue group by e filtri in colonna, in parallelo e senza caricare tutto in RAM; gli strumenti tipizzati restano gli stessi (cambia solo l'implementazione dei calcoli), quindi nessun SQL scritto dal modello.
4. **SQLite** solo se servono scritture concorrenti (es. dati aggiornati in tempo reale): è un database a righe, per aggregazioni su molte righe è più lento di DuckDB.
