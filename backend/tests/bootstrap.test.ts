import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DocumentService } from '../src/documents/service';
import { ensureKnowledgeBase } from '../src/rag/bootstrap';
import { assertEmbeddingModelMatches, deriveClienti } from '../src/rag/ingest';
import { InMemoryVectorStore } from '../src/rag/vectorStore';
import { FakeEmbedder } from './helpers/fakeEmbedder';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());

const ROOT = resolve(import.meta.dirname, '../..');
const KB = resolve(ROOT, 'knowledge_base/source');
let store: InMemoryVectorStore;
let embedder: FakeEmbedder;
let documents: DocumentService;

beforeEach(async () => {
  await resetDb(prisma);
  store = new InMemoryVectorStore();
  embedder = new FakeEmbedder();
  documents = new DocumentService({ prisma, store, embedder, rootDir: ROOT, uploadDir: mkdtempSync(join(tmpdir(), 'logisticai-boot-')), clienti: deriveClienti(KB) });
});

describe("indice della knowledge base all'avvio", () => {
  it('senza indicizzazione automatica un indice vuoto ferma l\'avvio con le istruzioni', async () => {
    await expect(ensureKnowledgeBase({ store, embedder, documents, kbDir: KB, auto: false })).rejects.toThrow(/npm run ingest/);
  });

  it('con AUTO_INGEST (primo avvio online) registra e indicizza i 10 documenti, poi il controllo passa', async () => {
    const res = await ensureKnowledgeBase({ store, embedder, documents, kbDir: KB, auto: true });
    expect(res).toEqual({ indexed: true, documents: 10 });
    expect(await prisma.document.count({ where: { status: 'ready' } })).toBe(10);
    await expect(assertEmbeddingModelMatches(store, embedder)).resolves.toBeUndefined();
  });

  it('indice già pronto e coerente: non rifà nulla', async () => {
    await ensureKnowledgeBase({ store, embedder, documents, kbDir: KB, auto: true });
    const calls = embedder.calls;
    const res = await ensureKnowledgeBase({ store, embedder, documents, kbDir: KB, auto: true });
    expect(res).toEqual({ indexed: false, documents: 0 });
    expect(embedder.calls).toBe(calls);
  });

  it('modello di embedding cambiato: con AUTO_INGEST reindicizza con il nuovo modello', async () => {
    await ensureKnowledgeBase({ store, embedder, documents, kbDir: KB, auto: true });
    const nuovo = new FakeEmbedder('altro-modello');
    const docs2 = new DocumentService({ prisma, store, embedder: nuovo, rootDir: ROOT, uploadDir: mkdtempSync(join(tmpdir(), 'logisticai-boot-')), clienti: deriveClienti(KB) });
    const res = await ensureKnowledgeBase({ store, embedder: nuovo, documents: docs2, kbDir: KB, auto: true });
    expect(res.indexed).toBe(true);
    await expect(assertEmbeddingModelMatches(store, nuovo)).resolves.toBeUndefined();
  });
});
