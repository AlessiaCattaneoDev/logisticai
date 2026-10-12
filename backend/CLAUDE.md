# Backend - orchestratore (Node.js + TypeScript)

Vedi anche: [../CLAUDE.md](../CLAUDE.md) (regole globali) e [../PROGETTO.md](../PROGETTO.md) §8–11.

## Ruolo
Autenticazione, conversazioni, loop ReAct con function calling, RAG su ChromaDB, libreria documenti (caricamento, estrazione testo, indicizzazione), API della home, chiamate al data agent, telemetria dei costi, API della dashboard admin. Stream SSE su `POST /api/chat`.

## Comandi
```bash
npm run dev          # tsx watch src/server.ts (legge ../.env)
npm test             # vitest run
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run db:migrate   # prisma migrate dev (schema in prisma/schema.prisma)
npm run db:seed      # utenti demo da SEED_* del .env (idempotente)
npm run ingest       # registra i 10 documenti iniziali e ricrea la collection Chroma da tutti i documenti del DB
npm run db:studio    # interfaccia web sul database
```
Prisma 7: client generato in `src/generated/prisma` (ignorato da git, `postinstall` lo rigenera), driver adapter `@prisma/adapter-better-sqlite3`, config in `prisma.config.ts`. `DATABASE_URL` è relativo alla cartella `backend/`.

## Struttura
```
src/
├── server.ts        ← entrypoint: carica .env, config, avvia l'app
├── app.ts           ← createApp(deps): app Express SENZA side effect (testabile con supertest)
├── config.ts        ← loadConfig(env) con zod; ConfigError elenca tutti i problemi
├── auth/            ← login, JWT in cookie httpOnly, requireAuth / requireAdmin
├── chat/            ← rotte chat, conversazioni, feedback, SSE
├── orchestrator/    ← loop ReAct, definizioni tool, system prompt (+ prompts/overrides/<provider>.ts)
├── llm/             ← LLMProvider / EmbeddingProvider, factory, adapters/, pricing
├── rag/             ← client Chroma, retriever (filtro per documento/categoria), chunker, ingest
├── documents/       ← extract.ts (PDF unpdf, DOCX mammoth, TXT, MD), catalog.ts (categorie e documenti iniziali), service.ts (coda di indicizzazione), routes.ts
├── home/            ← HomeService: dashboard personale e indicatori admin
├── services/        ← dataAgentClient (JWT di servizio 60 s, aud=data-agent)
├── telemetry/       ← LlmCall, calcolo costi, budget
├── admin/           ← API dashboard
└── db/              ← Prisma client
tests/               ← test di integrazione (supertest) e unit
```

## Convenzioni
- **Dependency injection:** `createApp` riceve le dipendenze (config, provider LLM, client esterni, health check). Nei test si passano versioni finte; mai `process.env` fuori da `server.ts`/`config.ts`.
- **SDK dei provider LLM solo in `src/llm/adapters/`.** Il resto del codice usa i tipi neutri di `src/llm/types.ts`.
  - Un nuovo provider = un file in `src/llm/adapters/` + un caso in `src/llm/factory.ts` + passare `src/llm/__tests__/conformance.test.ts`.
  - `NeutralMessage.providerState`: contenuto grezzo dell'assistente (es. blocchi thinking di Claude) da rimandare invariato **nello stesso turno ReAct**. Tra turni diversi la cronologia arriva dal DB come solo testo.
  - Claude: niente `temperature` né `tool_choice` forzato (400 sui modelli attuali); fallback server-side (`fallbacks: "default"`) attivi solo sull'API Anthropic diretta.
  - `LLMUsage.inputTokens` = input NON in cache; `cachedInputTokens` a parte (prezzo ridotto).
- Costi: ogni chiamata passa da `TelemetryRecorder.record()` (`src/telemetry/`), che applica il listino `ModelPricing` valido alla data.
- Validazione zod per input HTTP **e** per gli argomenti dei tool generati dall'LLM.
- Gli artifact (`ChartSpec`/`TableSpec`) del data agent vanno al front end e al DB, **mai** nel contesto dell'LLM: all'LLM va solo un riepilogo testuale.
- Ogni chiamata a un modello (orchestratore, embedding, data agent) va registrata come `LlmCall` passando da `telemetry/`.
- Tipi condivisi con il front end: importali da `@logisticai/shared`, non duplicarli.
- Import relativi con estensione `.js` nei file eseguiti da tsx (`./config.js`); nei test non serve.
- Log con `pino`, mai `console.log`.
- Chat: `ChatService` (src/chat/service.ts) salva messaggi, `ToolCall`, `MessageArtifact` (chart, table, source, data_agent) e le `LlmCall` con il `messageId`; l'orchestratore (src/orchestrator/agent.ts) non tocca il DB.
- Documenti: il file caricato va in `backend/storage/documents/` (escluso da git), la riga nasce `processing` e la coda sequenziale di `DocumentService` lo porta a `ready` (con il numero di sezioni) o `error` (motivo leggibile). All'avvio i documenti rimasti `processing` vengono rielaborati. Ogni sezione in Chroma ha `documentId` e `categoryId` per la chat con ambito.
- Chat con ambito (`scope` in `POST /api/chat`): solo lo strumento documentale, retriever filtrato, ambito salvato sulla conversazione.
- All'avvio `server.ts` si ferma se Chroma non risponde o se la KB è indicizzata con un altro modello di embedding (serve `npm run ingest`).

## Test
- Vitest + Supertest. File in `tests/**/*.test.ts` o accanto al codice come `*.test.ts`.
- LLM sempre finto negli unit/integration test (`FakeLLMProvider`).
- Database: `tests/globalSetup.ts` crea una volta `prisma/test-template.db` con le migrazioni; ogni file di test usa `createTestDb()` (copia isolata in una cartella temporanea) e `resetDb()` nel `beforeEach`. Per le app di test usa `buildTestApp()` e `createUser()` di `tests/helpers/testApp.ts`.
- Suite di conformità degli adapter in `src/llm/__tests__/`. Le eval con LLM reale (`npm run eval`) sono separate e richiedono chiavi.
