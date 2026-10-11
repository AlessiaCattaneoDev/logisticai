import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import pino from 'pino';
import { AdminService } from './admin/service.js';
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
    reasoningEffort: config.llm.reasoningEffort,
    systemPrompt: buildSystemPrompt(deriveClienti(resolve(ROOT, 'knowledge_base/source'))),
    retriever: new Retriever(embedder, store, { maxDistance: config.chroma.maxDistance }),
    dataAgent,
  });
  const recorder = new TelemetryRecorder(prisma, config.costs.usdEurRate);
  const chatService = new ChatService(prisma, orchestrator, recorder, 20, logger);
  const admin = new AdminService({
    prisma,
    chat: chatService,
    budgets: { dailyEur: config.costs.dailyBudgetEur, monthlyEur: config.costs.monthlyBudgetEur, usdEurRate: config.costs.usdEurRate },
    models: { orchestrator: `${config.llm.provider}:${config.llm.model}`, dataAgent: process.env.DATA_LLM_PROVIDER && process.env.DATA_LLM_MODEL ? `${process.env.DATA_LLM_PROVIDER}:${process.env.DATA_LLM_MODEL}` : 'n/d', embedding: `${config.embedding.provider}:${config.embedding.model}` },
    system: async () => {
      const [chroma, agent, info] = await Promise.all([store.healthy(), dataAgent.healthy(), store.info().catch(() => null)]);
      const quality = await dataAgent.dataQuality('admin').catch(() => null);
      return {
        servizi: { backend: 'ok', database: 'ok', chroma: chroma ? 'ok' : 'down', dataAgent: agent ? 'ok' : 'down' },
        knowledgeBase: info
          ? { chunk: info.count, documenti: info.metadata.documents ?? '', modelloEmbedding: `${info.metadata.embedding_provider}:${info.metadata.embedding_model}`, indicizzataIl: info.metadata.ingested_at ?? '' }
          : null,
        qualitaDati: quality as never,
      };
    },
  });

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
    chat: { service: chatService },
    admin,
  });
  app.listen(config.port, () => {
    logger.info(`Backend in ascolto su http://localhost:${config.port} (LLM ${config.llm.provider}:${config.llm.model})`);
  });
} catch (err) {
  if (err instanceof ConfigError) fatal(err.message);
  throw err;
}
