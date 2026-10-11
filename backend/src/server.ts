import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import pino from 'pino';
import { createApp } from './app.js';
import { ChatService } from './chat/service.js';
import { ConfigError, loadConfig } from './config.js';
import { createPrisma } from './db/client.js';
import { createEmbeddingProvider, createLLMProvider } from './llm/factory.js';
import { Orchestrator } from './orchestrator/agent.js';
import { buildSystemPrompt } from './orchestrator/systemPrompt.js';
import { assertEmbeddingModelMatches, deriveClienti } from './rag/ingest.js';
import { Retriever } from './rag/retriever.js';
import { ChromaVectorStore } from './rag/vectorStore.js';
import { DataAgentClient } from './services/dataAgentClient.js';
import { TelemetryRecorder } from './telemetry/recorder.js';

const logger = pino({ name: 'logisticai-backend' });
const ROOT = resolve(import.meta.dirname, '../..');

// Il .env è unico, nella root del repository.
loadDotenv({ path: resolve(ROOT, '.env'), quiet: true });

function fatal(message: string): never {
  logger.fatal(message);
  process.exit(1);
}

try {
  const config = loadConfig(process.env);
  const prisma = createPrisma(config.databaseUrl);
  const embedder = createEmbeddingProvider(config);
  const store = new ChromaVectorStore(config.chroma.url, config.chroma.collection);
  const dataAgent = new DataAgentClient({ baseUrl: config.dataAgentUrl, secret: config.internalServiceSecret });

  if (!(await store.healthy())) fatal(`ChromaDB non raggiungibile su ${config.chroma.url}: avvialo prima del backend (vedi README)`);
  await assertEmbeddingModelMatches(store, embedder).catch((err: Error) => fatal(err.message));
  if (!(await dataAgent.healthy())) logger.warn(`Data agent non raggiungibile su ${config.dataAgentUrl}: le analisi dei dati falliranno finché non è avviato`);

  const orchestrator = new Orchestrator({
    llm: createLLMProvider(config),
    model: config.llm.model,
    systemPrompt: buildSystemPrompt(deriveClienti(resolve(ROOT, 'knowledge_base/source'))),
    retriever: new Retriever(embedder, store, { maxDistance: config.chroma.maxDistance }),
    dataAgent,
  });
  const recorder = new TelemetryRecorder(prisma, config.costs.usdEurRate);

  const app = createApp({
    frontendOrigin: config.frontendOrigin,
    healthChecks: { chroma: () => store.healthy(), dataAgent: () => dataAgent.healthy() },
    prisma,
    auth: {
      jwtSecret: config.jwt.secret,
      expiresIn: config.jwt.expiresIn,
      secureCookies: config.production,
      loginRateLimit: { windowMs: 60_000, limit: 5 },
    },
    chat: { service: new ChatService(prisma, orchestrator, recorder) },
  });
  app.listen(config.port, () => {
    logger.info(`Backend in ascolto su http://localhost:${config.port} (LLM ${config.llm.provider}:${config.llm.model})`);
  });
} catch (err) {
  if (err instanceof ConfigError) fatal(err.message);
  throw err;
}
