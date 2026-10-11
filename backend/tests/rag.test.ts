import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { chunkMarkdown, MAX_CHUNK_CHARS } from '../src/rag/chunker';
import { assertEmbeddingModelMatches, deriveClienti, ingestKnowledgeBase } from '../src/rag/ingest';
import { Retriever } from '../src/rag/retriever';
import { InMemoryVectorStore } from '../src/rag/vectorStore';
import { FakeEmbedder } from './helpers/fakeEmbedder';

const KB = resolve(import.meta.dirname, '../../knowledge_base/source');

describe('chunker', () => {
  const sla = readFileSync(resolve(KB, '04_schede_sla_clienti.md'), 'utf8');
  const clienti = deriveClienti(KB);

  it('ricava i 10 clienti dalle schede SLA', () => {
    expect(clienti).toHaveLength(10);
    expect(clienti).toContain('ModaNova');
    expect(clienti).not.toContain('Regole comuni di misurazione dello SLA');
  });

  it('un chunk per sezione con documento, sezione e cliente', () => {
    const chunks = chunkMarkdown('04_schede_sla_clienti.md', sla, clienti);
    const moda = chunks.find((c) => c.metadata.sezione === 'ModaNova')!;
    expect(moda.metadata).toEqual({ documento: 'Schede SLA per cliente', sezione: 'ModaNova', file: '04_schede_sla_clienti.md', cliente: 'ModaNova' });
    expect(moda.text).toMatch(/^Documento: Schede SLA per cliente\nSezione: ModaNova\n\n/);
    expect(moda.text).toContain('1.000 €');
    const regole = chunks.find((c) => c.metadata.sezione.startsWith('Regole comuni'))!;
    expect(regole.metadata.cliente).toBeUndefined();
  });

  it('id univoci e deterministici', () => {
    const a = chunkMarkdown('04_schede_sla_clienti.md', sla, clienti).map((c) => c.id);
    expect(new Set(a).size).toBe(a.length);
    expect(chunkMarkdown('04_schede_sla_clienti.md', sla, clienti).map((c) => c.id)).toEqual(a);
  });

  it('sezioni lunghe divise in parti con sovrapposizione', () => {
    const long = `# Doc\n\n## Lunga\n\n${Array.from({ length: 40 }, (_, i) => `Paragrafo ${i} ${'parola '.repeat(30)}`).join('\n\n')}`;
    const chunks = chunkMarkdown('x.md', long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThan(MAX_CHUNK_CHARS + 400);
  });
});

describe('ingestion e retrieval', () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  let retriever: Retriever;

  beforeAll(async () => {
    const res = await ingestKnowledgeBase({ sourceDir: KB, embedder, store });
    expect(res.documents).toBe(10);
    expect(res.chunks).toBeGreaterThan(40);
    retriever = new Retriever(embedder, store, { maxDistance: 0.9 });
  });

  it('salva il modello di embedding nei metadati della collection', async () => {
    const info = await store.info();
    expect(info?.metadata).toMatchObject({ embedding_provider: 'fake', embedding_model: 'fake-embedding', documents: '10' });
    await expect(assertEmbeddingModelMatches(store, embedder)).resolves.toBeUndefined();
  });

  it('blocca l’avvio se il modello di embedding cambia', async () => {
    await expect(assertEmbeddingModelMatches(store, new FakeEmbedder('altro-modello'))).rejects.toThrow(/npm run ingest/);
    await expect(assertEmbeddingModelMatches(new InMemoryVectorStore(), embedder)).rejects.toThrow(/non indicizzata/);
  });

  it('con il cliente indicato la sua scheda SLA è il primo risultato', async () => {
    const res = await retriever.search('soglia di puntualità e penale per punto', { cliente: 'ModaNova' });
    expect(res.trovato).toBe(true);
    expect(res.risultati[0]).toMatchObject({ documento: 'Schede SLA per cliente', sezione: 'ModaNova', cliente: 'ModaNova' });
    expect(res.risultati.every((r) => !r.cliente || r.cliente === 'ModaNova')).toBe(true);
  });

  it('il testo restituito non ripete l’intestazione e ha una rilevanza', async () => {
    const [first] = (await retriever.search('riserva alla consegna danni occulti 8 giorni')).risultati;
    expect(first.documento).toMatch(/Procedura reclami e danni|FAQ/);
    expect(first.testo.startsWith('Documento:')).toBe(false);
    expect(first.rilevanza).toBeGreaterThan(0);
  });

  it('nessun risultato sopra la soglia: trovato=false', async () => {
    const strict = new Retriever(embedder, store, { maxDistance: 0.01 });
    expect(await strict.search('quotazione del bitcoin oggi')).toMatchObject({ trovato: false, risultati: [] });
  });

  it('restituisce l’uso del modello di embedding (per i costi)', async () => {
    const { embedding } = await retriever.search('giacenza costi');
    expect(embedding).toMatchObject({ provider: 'fake', model: 'fake-embedding' });
    expect(embedding.inputTokens).toBeGreaterThan(0);
  });

  it('rispetta topK', async () => {
    expect((await retriever.search('spedizioni', { topK: 2 })).risultati.length).toBeLessThanOrEqual(2);
  });
});
