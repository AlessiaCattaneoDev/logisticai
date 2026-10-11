# LogisticAI — monorepo

Copilota AI ibrido per Customer Service e Operations di un 3PL fittizio (Padana Logistics S.r.l.).
Progetto finale del Master, pensato per diventare un prodotto vendibile alle PMI.

**Specifica completa: [PROGETTO.md](PROGETTO.md).** Leggila prima di modificare l'architettura; se una decisione cambia, aggiorna anche PROGETTO.md.

## Servizi

| Cartella | Stack | Porta | Istruzioni |
|---|---|---|---|
| `frontend/` | React + Vite + TypeScript + Tailwind | 5173 | [frontend/CLAUDE.md](frontend/CLAUDE.md) |
| `backend/` | Node.js + TypeScript + Express 5 + Prisma | 3001 | [backend/CLAUDE.md](backend/CLAUDE.md) |
| `data_agent/` | Python 3.12 + FastAPI + LangChain pandas agent | 8001 | [data_agent/CLAUDE.md](data_agent/CLAUDE.md) |
| ChromaDB | `chroma run` | 8000 | — |
| `shared/types/` | Tipi TS + schemi zod condivisi (`@logisticai/shared`) | — | — |
| `shared/contracts/fixtures/` | JSON validati sia da zod sia da pydantic | — | — |
| `data/` | CSV spedizioni + generatore (`generate_dataset.py`) | — | vedi data_agent/CLAUDE.md |
| `knowledge_base/` | Sorgenti `.md` e PDF della knowledge base RAG | — | — |

npm workspaces: `shared/types`, `backend`, `frontend`. Il data agent ha un venv proprio in `data_agent/.venv`.

## Comandi

```bash
npm install                      # dipendenze di tutti i workspace JS
npm test                         # TUTTI i test: shared + backend + frontend + data agent + dati
npm run test:shared | test:be | test:fe | test:ai
npm run typecheck

# Dati e knowledge base (venv del data agent)
cd data && ../data_agent/.venv/bin/python generate_dataset.py      # rigenera CSV + anomalie_manifest.json
cd knowledge_base && ../data_agent/.venv/bin/python build_pdf.py   # rigenera il PDF dalle sorgenti .md
```

Se modifichi `data/business_rules.json`, il generatore o le sorgenti della KB, rigenera CSV e/o PDF: i test falliscono se sono vecchi.

## Regole non negoziabili

1. **Test sempre.** Ogni modifica di codice arriva con i suoi test, scritti prima dove possibile. `npm test` deve restare verde. Gli unit test non chiamano mai un LLM reale: le eval con LLM reale sono separate e opzionali.
2. **Grafici e tabelle solo come componenti React** (Recharts + TanStack Table) da spec JSON (`ChartSpec` / `TableSpec`). Mai matplotlib, seaborn, plotly o immagini, nemmeno come fallback.
3. **Contratti condivisi.** Se cambi `ChartSpec`/`TableSpec`, aggiorna insieme lo schema zod (`shared/types/src/artifacts.ts`), il modello pydantic (`data_agent/specs.py`) e le fixture (`shared/contracts/fixtures/`).
4. **Indipendenza dal provider LLM.** Nessun SDK di provider fuori da `backend/src/llm/adapters/`. Il data agent usa `init_chat_model`. Cambiare provider = cambiare `.env`.
5. **Nessun segreto nel codice.** Tutto passa dal `.env` della root (template: `.env.example`). Mai committare `.env`.
6. **Coerenza dati ↔ knowledge base.** Clienti, vettori, hub, servizi, soglie e penali devono essere identici in `data/business_rules.json`, nel CSV e nei documenti della KB.
7. **Lingua.** Testi dell'interfaccia, prompt, documenti e messaggi utente in italiano. Codice e identificatori tecnici possono essere in inglese; i nomi di dominio restano in italiano (es. `analizza_dati`, `puntualita`).
