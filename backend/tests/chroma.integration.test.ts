// Test d'integrazione con un server ChromaDB reale. Si attiva con CHROMA_TEST_URL, es.:
//   CHROMA_TEST_URL=http://127.0.0.1:8000 npx vitest run tests/chroma.integration.test.ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertEmbeddingModelMatches, ingestKnowledgeBase } from '../src/rag/ingest';
import { Retriever } from '../src/rag/retriever';
import { ChromaVectorStore } from '../src/rag/vectorStore';
import { FakeEmbedder } from './helpers/fakeEmbedder';

const url = process.env.CHROMA_TEST_URL;

describe.skipIf(!url)('ChromaVectorStore (server reale)', () => {
  it('indicizza la KB e trova la scheda SLA del cliente', async () => {
    const store = new ChromaVectorStore(url!, `test_${Date.now()}`);
    expect(await store.healthy()).toBe(true);
    const embedder = new FakeEmbedder();
    const res = await ingestKnowledgeBase({ sourceDir: resolve(import.meta.dirname, '../../knowledge_base/source'), embedder, store });
    expect((await store.info())?.count).toBe(res.chunks);
    await assertEmbeddingModelMatches(store, embedder);
    const found = await new Retriever(embedder, store, { maxDistance: 0.9 }).search('penale per punto', { cliente: 'TechPoint' });
    expect(found.risultati[0]).toMatchObject({ sezione: 'TechPoint', cliente: 'TechPoint' });
    await store.drop();
    expect(await store.info()).toBeNull();
  });
});
