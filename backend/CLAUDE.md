# Backend - orchestratore (Node.js + TypeScript)

Vedi anche: [../CLAUDE.md](../CLAUDE.md) (regole globali) e [../PROGETTO.md](../PROGETTO.md) §8–11.

## Ruolo
Autenticazione, conversazioni, loop ReAct con function calling, RAG su ChromaDB, chiamate al data agent, telemetria dei costi, API della dashboard admin. Stream SSE su `POST /api/chat`.

## Comandi
```bash
npm run dev          # tsx watch src/server.ts (legge ../.env)
npm test             # vitest run
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run db:migrate   # prisma migrate dev (schema in prisma/schema.prisma)
npm run db:seed      # utenti demo da SEED_* del .env (idempotente)
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
├── rag/             ← client Chroma, retriever, ingest
├── services/        ← dataAgentClient (JWT di servizio 60 s, aud=data-agent)
├── telemetry/       ← LlmCall, calcolo costi, budget
├── admin/           ← API dashboard
└── db/              ← Prisma client
tests/               ← test di integrazione (supertest) e unit
```

## Convenzioni
- **Dependency injection:** `createApp` riceve le dipendenze (config, provider LLM, client esterni, health check). Nei test si passano versioni finte; mai `process.env` fuori da `server.ts`/`config.ts`.
- **SDK dei provider LLM solo in `src/llm/adapters/`.** Il resto del codice usa i tipi neutri di `src/llm/types.ts`.
- Validazione zod per input HTTP **e** per gli argomenti dei tool generati dall'LLM.
- Gli artifact (`ChartSpec`/`TableSpec`) del data agent vanno al front end e al DB, **mai** nel contesto dell'LLM: all'LLM va solo un riepilogo testuale.
- Ogni chiamata a un modello (orchestratore, embedding, data agent) va registrata come `LlmCall` passando da `telemetry/`.
- Tipi condivisi con il front end: importali da `@logisticai/shared`, non duplicarli.
- Import relativi con estensione `.js` nei file eseguiti da tsx (`./config.js`); nei test non serve.
- Log con `pino`, mai `console.log`.

## Test
- Vitest + Supertest. File in `tests/**/*.test.ts` o accanto al codice come `*.test.ts`.
- LLM sempre finto negli unit/integration test (`FakeLLMProvider`).
- Database: `tests/globalSetup.ts` crea una volta `prisma/test-template.db` con le migrazioni; ogni file di test usa `createTestDb()` (copia isolata in una cartella temporanea) e `resetDb()` nel `beforeEach`. Per le app di test usa `buildTestApp()` e `createUser()` di `tests/helpers/testApp.ts`.
- Suite di conformità degli adapter in `src/llm/__tests__/`. Le eval con LLM reale (`npm run eval`) sono separate e richiedono chiavi.
