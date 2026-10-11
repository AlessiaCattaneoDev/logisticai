// npm run ingest: indicizza la knowledge base in ChromaDB (Chroma deve essere avviato).
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config.js';
import { createEmbeddingProvider } from '../llm/factory.js';
import { ingestKnowledgeBase } from './ingest.js';
import { ChromaVectorStore } from './vectorStore.js';

loadDotenv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const config = loadConfig(process.env);
const store = new ChromaVectorStore(config.chroma.url, config.chroma.collection);
if (!(await store.healthy())) {
  console.error(`ChromaDB non raggiungibile su ${config.chroma.url}: avvialo prima (vedi README)`);
  process.exit(1);
}
const result = await ingestKnowledgeBase({
  sourceDir: resolve(import.meta.dirname, '../../../knowledge_base/source'),
  embedder: createEmbeddingProvider(config),
  store,
});
console.log(`Indicizzati ${result.documents} documenti in ${result.chunks} chunk (${result.embeddingTokens} token di embedding)`);
