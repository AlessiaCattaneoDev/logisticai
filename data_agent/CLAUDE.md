# Data agent — Python (servizio AI di analisi dati)

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
main.py        ← create_app(): FastAPI, rotte /health, /analyze, /data-quality
auth.py        ← verifica JWT di servizio (iss=logisticai-backend, aud=data-agent, exp 60 s)
agent.py       ← pandas agent: init_chat_model(f"{DATA_LLM_PROVIDER}:{DATA_LLM_MODEL}"), agent_type tool-calling
cleaning.py    ← pulisci_dataset(df) -> (df_pulito, report): pipeline deterministica
kpi.py         ← calcola_puntualita(df, cause_escluse=…) e altri KPI deterministici
specs.py       ← modelli pydantic ChartSpec / TableSpec (contratto con shared/types)
artifacts.py   ← crea_grafico() / crea_tabella(): DataFrame -> spec validata e registrata
tests/
```

## Regole
- **Nessuna libreria grafica** (matplotlib, seaborn, plotly vietati). I grafici sono `ChartSpec`, le tabelle `TableSpec`, create solo tramite gli helper di `artifacts.py`.
- Il servizio restituisce solo gli artifact registrati dagli helper, mai quanto "dichiarato" nel testo dell'LLM.
- `specs.py` deve restare equivalente a `shared/types/src/artifacts.ts`: il test `test_specs_contract.py` usa le fixture condivise.
- KPI che diventano soldi (puntualità → penali) si calcolano con funzioni deterministiche in `kpi.py`, testate. L'agente sceglie filtri e raggruppamenti, non la definizione del KPI.
- Il CSV è in sola lettura. `allow_dangerous_code=True` è accettato solo perché il servizio è locale e autenticato: mantieni `max_iterations` e timeout.
- Nessun SDK di provider importato direttamente: solo `init_chat_model`.
- Il `.env` è nella root del repo (`../.env`).

## Test
- pytest; FastAPI con `TestClient`; LLM finto (`FakeListChatModel` / stub) negli unit test.
- Eval con LLM reale marcate `@pytest.mark.eval`, escluse di default da `pytest.ini`.
- Il generatore del dataset ha test che verificano anomalie e "storie" (PROGETTO.md §5.3): se cambi il generatore, quei test devono restare verdi.
