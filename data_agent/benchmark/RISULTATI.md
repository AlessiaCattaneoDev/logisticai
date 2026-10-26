# Benchmark del data agent

Generato da `data_agent/benchmark.py` il 2026-10-26 su Darwin arm64, Python 3.12.0, pandas 3.0.6. I dataset più grandi sono costruiti dallo storico reale (12.240 righe), non sono dati nuovi: leggi "Come leggere questi numeri" prima delle conclusioni.

- **Dati replicati:** lo storico copiato N volte; stessi 10 clienti, 5 vettori e 24 mesi.
- **Dati variati:** ogni copia ha clienti e vettori nuovi e un periodo successivo (a 40 copie: 400 clienti, 200 vettori, 80 anni). I raggruppamenti diventano molto più grandi, come per un 3PL con molti clienti.

Ogni cella: miglior tempo su 3 esecuzioni (le operazioni di avvio oltre 100.000 righe una sola volta) / picco di memoria allocata durante l'operazione (tracemalloc). L'RSS è misurato in un processo nuovo che ripete i passi di avvio del servizio: è il valore da usare per dimensionare il server.

## Confronto alla dimensione più grande (489.600 righe)

| Indicatore | Dati replicati | Dati variati |
|---|---:|---:|
| Analisi più lenta | 0.14 s | 0.15 s |
| Avvio (caricamento + validazione + pulizia) | 17.10 s | 17.80 s |
| Memoria del processo (RSS di picco) | 713.02 MB | 687.95 MB |

## Dati replicati

Clienti, vettori e mesi nei dati puliti: 12.240 righe 10 / 5 / 25, 24.480 righe 10 / 5 / 25, 61.200 righe 10 / 5 / 25, 122.400 righe 10 / 5 / 25, 244.800 righe 10 / 5 / 25, 489.600 righe 10 / 5 / 25.

### Avvio del servizio

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Caricamento CSV | 0.026 s / 5 MB | 0.043 s / 8 MB | 0.100 s / 19 MB | 0.199 s / 38 MB | 0.406 s / 76 MB | 0.825 s / 149 MB |
| Validazione colonne e tipi | 0.141 s / 1 MB | 0.268 s / 2 MB | 0.663 s / 6 MB | 1.329 s / 11 MB | 2.632 s / 23 MB | 5.509 s / 46 MB |
| Pulizia dati | 0.288 s / 8 MB | 0.567 s / 17 MB | 1.391 s / 43 MB | 2.788 s / 86 MB | 5.599 s / 171 MB | 10.763 s / 343 MB |

### Analisi (una chiamata di strumento)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Puntualità mensile per cliente | 0.006 s / 1 MB | 0.009 s / 2 MB | 0.020 s / 5 MB | 0.038 s / 9 MB | 0.074 s / 18 MB | 0.144 s / 37 MB |
| Tasso danni per vettore e mese | 0.004 s / 3 MB | 0.007 s / 6 MB | 0.014 s / 17 MB | 0.028 s / 34 MB | 0.053 s / 68 MB | 0.097 s / 135 MB |
| Margine per cliente | 0.002 s / 0 MB | 0.002 s / 1 MB | 0.004 s / 3 MB | 0.007 s / 6 MB | 0.012 s / 12 MB | 0.022 s / 23 MB |
| Spedizioni per motivo di ritardo | 0.001 s / 0 MB | 0.001 s / 1 MB | 0.002 s / 2 MB | 0.003 s / 5 MB | 0.005 s / 10 MB | 0.008 s / 20 MB |
| Verifica SLA mensile (un cliente) | 0.004 s / 0 MB | 0.004 s / 0 MB | 0.007 s / 1 MB | 0.010 s / 1 MB | 0.018 s / 3 MB | 0.034 s / 6 MB |
| Qualifica subvettori | 0.006 s / 3 MB | 0.008 s / 6 MB | 0.016 s / 17 MB | 0.029 s / 34 MB | 0.054 s / 68 MB | 0.098 s / 135 MB |
| Filtro cliente + periodo | 0.002 s / 1 MB | 0.003 s / 2 MB | 0.008 s / 4 MB | 0.015 s / 8 MB | 0.033 s / 15 MB | 0.058 s / 30 MB |

Memoria del DataFrame pulito: 12.240 righe 10 MB, 24.480 righe 20 MB, 61.200 righe 49 MB, 122.400 righe 98 MB, 244.800 righe 197 MB, 489.600 righe 394 MB.

### Memoria effettiva del processo (RSS di picco)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Processo dopo gli import (Python, pandas, LangChain) | 77 MB | 76 MB | 75 MB | 75 MB | 76 MB | 75 MB |
| Dopo l'avvio: CSV grezzo, report di pulizia, copia e dati preparati dell'agente | 119 MB | 139 MB | 190 MB | 269 MB | 439 MB | 673 MB |
| Dopo le 7 analisi | 120 MB | 139 MB | 190 MB | 271 MB | 456 MB | 713 MB |

## Dati variati

Clienti, vettori e mesi nei dati puliti: 12.240 righe 10 / 5 / 25, 24.480 righe 20 / 10 / 49, 61.200 righe 50 / 25 / 121, 122.400 righe 100 / 50 / 241, 244.800 righe 200 / 100 / 481, 489.600 righe 400 / 200 / 961.

### Avvio del servizio

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Caricamento CSV | 0.025 s / 5 MB | 0.049 s / 9 MB | 0.115 s / 23 MB | 0.230 s / 46 MB | 0.459 s / 91 MB | 0.908 s / 182 MB |
| Validazione colonne e tipi | 0.141 s / 1 MB | 0.271 s / 2 MB | 0.656 s / 6 MB | 1.323 s / 11 MB | 2.667 s / 23 MB | 5.417 s / 46 MB |
| Pulizia dati | 0.294 s / 8 MB | 0.575 s / 17 MB | 1.410 s / 43 MB | 2.855 s / 86 MB | 5.771 s / 172 MB | 11.473 s / 344 MB |

### Analisi (una chiamata di strumento)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Puntualità mensile per cliente | 0.006 s / 1 MB | 0.010 s / 2 MB | 0.019 s / 5 MB | 0.038 s / 9 MB | 0.076 s / 19 MB | 0.146 s / 37 MB |
| Tasso danni per vettore e mese | 0.004 s / 3 MB | 0.007 s / 6 MB | 0.016 s / 17 MB | 0.029 s / 34 MB | 0.054 s / 68 MB | 0.110 s / 135 MB |
| Margine per cliente | 0.002 s / 0 MB | 0.003 s / 1 MB | 0.004 s / 3 MB | 0.007 s / 6 MB | 0.012 s / 12 MB | 0.024 s / 23 MB |
| Spedizioni per motivo di ritardo | 0.001 s / 0 MB | 0.002 s / 1 MB | 0.002 s / 2 MB | 0.003 s / 5 MB | 0.005 s / 10 MB | 0.008 s / 20 MB |
| Verifica SLA mensile (un cliente) | 0.003 s / 0 MB | 0.004 s / 0 MB | 0.005 s / 1 MB | 0.010 s / 1 MB | 0.016 s / 3 MB | 0.030 s / 6 MB |
| Qualifica subvettori | 0.007 s / 3 MB | 0.011 s / 6 MB | 0.020 s / 17 MB | 0.040 s / 34 MB | 0.074 s / 68 MB | 0.146 s / 135 MB |
| Filtro cliente + periodo | 0.002 s / 1 MB | 0.003 s / 1 MB | 0.005 s / 2 MB | 0.009 s / 5 MB | 0.016 s / 10 MB | 0.031 s / 20 MB |

Memoria del DataFrame pulito: 12.240 righe 10 MB, 24.480 righe 20 MB, 61.200 righe 49 MB, 122.400 righe 99 MB, 244.800 righe 198 MB, 489.600 righe 397 MB.

### Memoria effettiva del processo (RSS di picco)

| Operazione | 12.240 righe | 24.480 righe | 61.200 righe | 122.400 righe | 244.800 righe | 489.600 righe |
|---|---:|---:|---:|---:|---:|---:|
| Processo dopo gli import (Python, pandas, LangChain) | 75 MB | 75 MB | 74 MB | 75 MB | 75 MB | 74 MB |
| Dopo l'avvio: CSV grezzo, report di pulizia, copia e dati preparati dell'agente | 110 MB | 144 MB | 212 MB | 301 MB | 407 MB | 664 MB |
| Dopo le 7 analisi | 111 MB | 150 MB | 222 MB | 302 MB | 407 MB | 688 MB |

## Come leggere questi numeri

- **Dati sintetici.** Anche i dati variati nascono dallo storico: stesse anomalie in proporzione, stessa distribuzione per cliente e per mese, testi della stessa lunghezza. Cambiano il numero di clienti, vettori e mesi, cioè la dimensione dei raggruppamenti. Dati reali possono avere altre distribuzioni (pochi clienti molto grandi, stagionalità diverse).
- **Stime indicative.** Le soglie non superate sono stimate con un'estrapolazione lineare dalla dimensione più grande, su una sola macchina e senza altro carico: danno l'ordine di grandezza, non una garanzia. Prima di decidere un cambio di motore vanno rifatte sul server di produzione e, se possibile, con dati reali.
- **Due misure di memoria.** tracemalloc conta le allocazioni Python e numpy di una singola operazione; l'RSS conta tutta la memoria del processo. Per il dimensionamento vale l'RSS, che tra un'esecuzione e l'altra varia di circa il 10% (allocatore e garbage collector).
- **Cosa hanno trovato i dati variati.** I tempi cambiano poco, ma la prima esecuzione ha mostrato un errore della pulizia: un nome era considerato "vero" solo sopra l'1% delle righe, quindi con molti clienti quelli piccoli non venivano più unificati (50 copie di un cliente diventavano 60 clienti). Corretto in `cleaning.py` con un test di regressione.

## Decisione

Soglie: analisi singola 1 s (l'agente ne fa diverse per domanda, oltre il calcolo pesa sulla risposta), avvio 30 s, memoria 1.024 MB. Lo storico attuale ha 12.240 righe.

Dati replicati:

- Fino a 489.600 righe: nessun caso in cui la singola analisi più lenta supera 1 s (a 489.600 righe: 0.14 s). Stima lineare indicativa: circa **3.390.000 righe**.
- Fino a 489.600 righe: nessun caso in cui l'avvio (caricamento + validazione + pulizia) supera 30 s (a 489.600 righe: 17.10 s). Stima lineare indicativa: circa **860.000 righe**.
- Fino a 489.600 righe: nessun caso in cui la memoria del processo (RSS di picco) supera 1.024 MB (a 489.600 righe: 713.02 MB). Stima lineare indicativa: circa **700.000 righe**.

Dati variati:

- Fino a 489.600 righe: nessun caso in cui la singola analisi più lenta supera 1 s (a 489.600 righe: 0.15 s). Stima lineare indicativa: circa **3.350.000 righe**.
- Fino a 489.600 righe: nessun caso in cui l'avvio (caricamento + validazione + pulizia) supera 30 s (a 489.600 righe: 17.80 s). Stima lineare indicativa: circa **830.000 righe**.
- Fino a 489.600 righe: nessun caso in cui la memoria del processo (RSS di picco) supera 1.024 MB (a 489.600 righe: 687.95 MB). Stima lineare indicativa: circa **730.000 righe**.

Cosa introdurre e quando:

1. **Finché nessuna soglia è superata**: pandas in memoria resta la scelta più semplice; la cache delle risposte evita già di rifare le domande ripetute.
2. **Memoria alta**: il servizio oggi tiene più copie del dataset (CSV grezzo in `main.py`, copia e dati preparati nell'agente). Tenere solo i dati preparati riduce la memoria senza cambiare motore ed è il primo intervento da fare.
3. **Avvio lento ma analisi veloci** (la pulizia domina): salvare il dataset pulito in Parquet e ricaricarlo all'avvio se l'impronta del CSV non è cambiata, invece di ripulirlo ogni volta.
4. **Analisi oltre la soglia o memoria ancora alta**: DuckDB sul file Parquet/CSV. Esegue group by e filtri in colonna, in parallelo e senza caricare tutto in RAM; gli strumenti tipizzati restano gli stessi (cambia solo l'implementazione dei calcoli), quindi nessun SQL scritto dal modello.
5. **SQLite** solo se servono scritture concorrenti (es. dati aggiornati in tempo reale): è un database a righe, per aggregazioni su molte righe è più lento di DuckDB.
