# Data agent - Python (servizio AI di analisi dati)

Vedi anche: [../CLAUDE.md](../CLAUDE.md) (regole globali) e [../PROGETTO.md](../PROGETTO.md) §5 e §12.

## Ruolo
Microservizio FastAPI chiamato **solo** dal backend (JWT di servizio, ascolto su 127.0.0.1). Riceve una domanda in linguaggio naturale (+ regole contrattuali opzionali lette dalla KB), fa analizzare `data/spedizioni.csv` a un pandas agent LangChain e restituisce sintesi narrativa, spec di grafici/tabelle, codice eseguito, pulizia effettuata e uso dei token.

## Comandi
```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt   # setup
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001 --reload        # avvio
.venv/bin/python -m pytest                                              # test (eval escluse)
.venv/bin/python -m pytest -m eval                                      # eval con LLM reale (chiave API richiesta)
```
Il generatore del dataset sta in `../data/` e usa lo stesso venv: `cd ../data && ../data_agent/.venv/bin/python -m pytest`.

## Struttura
```
main.py        ← create_app(settings, llm_factory): /health (pubblico), /analyze e /data-quality (JWT di servizio)
config.py      ← Settings.from_env(): segreto, CSV_PATH, DATA_LLM_PROVIDER/MODEL, timeout, max_iterations
auth.py        ← service_auth(secret): JWT HS256, iss=logisticai-backend, aud=data-agent, TTL max 120 s
dataset.py     ← load_raw(path): CSV letto tutto come testo (le anomalie restano visibili)
cleaning.py    ← pulisci_dataset(df) -> (df_pulito, ReportPulizia): deterministica, idempotente, colonne extra qualita_dato e mese_previsto
kpi.py         ← calcola_puntualita, calcola_penale, tasso_danni, margine (le soglie arrivano come parametri)
specs.py       ← modelli pydantic ChartSpec / TableSpec (contratto con shared/types)
artifacts.py   ← ArtifactRegistry: crea_grafico() / crea_tabella() -> spec validate; riepilogo() per l'LLM
agent.py       ← DataAnalyst: create_pandas_dataframe_agent (tool-calling) + helper iniettati nel REPL + UsageRecorder
tests/         ← fakes.py (LLM finto con tool call), test_eval.py (LLM reale, marcati eval)
```

### Contratto di POST /analyze
Richiesta: `{ domanda, genera_grafico, regole_da_applicare? }`
Risposta: `{ sintesi, artifacts[] (camelCase, schema condiviso), artifacts_riepilogo[], codice_eseguito[], pulizia[], righe_analizzate, usage[{provider, model, input_tokens, output_tokens, latency_ms}] }`
Errori: 401 token, 422 input, 502 errore del modello/agente, 504 timeout.

## Regole
- **Nessuna libreria grafica** (matplotlib, seaborn, plotly vietati). I grafici sono `ChartSpec`, le tabelle `TableSpec`, create solo tramite gli helper di `artifacts.py`.
- Il servizio restituisce solo gli artifact registrati dagli helper, mai quanto "dichiarato" nel testo dell'LLM.
- `specs.py` deve restare equivalente a `shared/types/src/artifacts.ts`: il test `test_specs_contract.py` usa le fixture condivise.
- KPI che diventano soldi (puntualità → penali) si calcolano con funzioni deterministiche in `kpi.py`, testate. L'agente sceglie filtri e raggruppamenti, non la definizione del KPI.
- Il CSV è in sola lettura. `allow_dangerous_code=True` è accettato solo perché il servizio è locale e autenticato: mantieni `max_iterations` e timeout.
- Nessun SDK di provider importato direttamente: solo `init_chat_model`.
- Il `.env` è nella root del repo (`../.env`); `main:app` lo legge solo all'avvio di uvicorn (import nei test senza side effect).
- `langchain-experimental` è in dismissione: tutto l'uso di `create_pandas_dataframe_agent` è confinato in `agent.py`, così si può sostituire senza toccare il resto.
- Il servizio NON legge `data/business_rules.json` (lo verifica `test_boundaries.py`): le regole arrivano dal backend, lette dalla KB.

## Test
- pytest; FastAPI con `TestClient`; LLM finto (`FakeListChatModel` / stub) negli unit test.
- Eval con LLM reale marcate `@pytest.mark.eval`, escluse di default da `pytest.ini`.
- Il generatore del dataset ha test che verificano anomalie e "storie" (PROGETTO.md §5.3): se cambi il generatore, quei test devono restare verdi.
