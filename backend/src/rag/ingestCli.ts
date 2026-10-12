// npm run ingest: registra i documenti della knowledge base originale e reindicizza in ChromaDB
// l'intera libreria (documenti di sistema e caricati). Chroma deve essere avviato.
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config.js';
import { createPrisma } from '../db/client.js';
import { DocumentService } from '../documents/service.js';
import { createEmbeddingProvider } from '../llm/factory.js';
import { deriveClienti } from './ingest.js';
import { ChromaVectorStore } from './vectorStore.js';

const ROOT = resolve(import.meta.dirname, '../../..');
loadDotenv({ path: resolve(ROOT, '.env'), quiet: true });

const config = loadConfig(process.env);
const store = new ChromaVectorStore(config.chroma.url, config.chroma.collection);
if (!(await store.healthy())) {
  console.error(`ChromaDB non raggiungibile su ${config.chroma.url}: avvialo prima (vedi README)`);
  process.exit(1);
}
const prisma = createPrisma(config.databaseUrl);
const kb = resolve(ROOT, 'knowledge_base/source');
const service = new DocumentService({
  prisma,
  store,
  embedder: createEmbeddingProvider(config),
  rootDir: ROOT,
  uploadDir: resolve(ROOT, 'backend/storage/documents'),
  clienti: deriveClienti(kb),
});
try {
  const nuovi = await service.registerSeedDocuments(kb);
  const res = await service.reindexAll();
  console.log(`Libreria indicizzata: ${res.ready} documenti disponibili su ${res.documents}${res.errors ? `, ${res.errors} con errori` : ''} (${nuovi} documenti di sistema registrati ora)`);
} finally {
  await prisma.$disconnect();
}
