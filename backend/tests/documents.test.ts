import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentCategoryDto, DocumentDto } from '@logisticai/shared';
import { DocumentService } from '../src/documents/service';
import { deriveClienti } from '../src/rag/ingest';
import { Retriever } from '../src/rag/retriever';
import { InMemoryVectorStore } from '../src/rag/vectorStore';
import { FakeEmbedder } from './helpers/fakeEmbedder';
import { buildTestApp, createUser } from './helpers/testApp';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());

const ROOT = resolve(import.meta.dirname, '../..');
const fx = (name: string) => resolve(import.meta.dirname, 'fixtures/documents', name);
let store: InMemoryVectorStore;
let service: DocumentService;
let uploadDir: string;
let embedCalls: { inputTokens: number; userId: string | null }[];

beforeEach(async () => {
  await resetDb(prisma);
  store = new InMemoryVectorStore();
  uploadDir = mkdtempSync(join(tmpdir(), 'logisticai-docs-'));
  embedCalls = [];
  service = new DocumentService({
    prisma, store, embedder: new FakeEmbedder(), rootDir: ROOT, uploadDir, maxBytes: 64 * 1024, clienti: deriveClienti(resolve(ROOT, 'knowledge_base/source')),
    onEmbedding: (u, userId) => void embedCalls.push({ inputTokens: u.inputTokens, userId }),
  });
  await service.ensureDefaultCategories();
});

function app() {
  return buildTestApp(prisma, { documents: { service, maxBytes: 64 * 1024 } });
}

async function login(a: ReturnType<typeof app>, username: string, role: 'OPERATOR' | 'ADMIN' = 'OPERATOR') {
  await createUser(prisma, username, 'Password!2026', role);
  const agent = request.agent(a);
  await agent.post('/api/auth/login').send({ username, password: 'Password!2026' });
  return agent;
}

async function categoryId(name = 'Reclami e giacenze') {
  return (await prisma.documentCategory.findUniqueOrThrow({ where: { name } })).id;
}

describe('categorie', () => {
  it('6 categorie predefinite con conteggi, visibili a tutti', async () => {
    const sara = await login(app(), 'sara');
    const cats = (await sara.get('/api/categories')).body as DocumentCategoryDto[];
    expect(cats.map((c) => c.name)).toEqual(['Contratti e SLA clienti', 'Servizi e tempi di resa', 'Reclami e giacenze', 'Magazzino e merci speciali', 'Vettori e qualità', 'Organizzazione e FAQ']);
    expect(cats[0]).toMatchObject({ documents: 0, ready: 0 });
  });

  it('solo l’admin crea e rinomina categorie, senza doppioni', async () => {
    const a = app();
    const sara = await login(a, 'sara');
    expect((await sara.post('/api/categories').send({ name: 'Sicurezza' })).status).toBe(403);
    const admin = await login(a, 'admin', 'ADMIN');
    const created = await admin.post('/api/categories').send({ name: 'Sicurezza sul lavoro', description: 'DVR e procedure' });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/categories').send({ name: 'Sicurezza sul lavoro' })).status).toBe(409);
    expect((await admin.patch(`/api/categories/${created.body.id}`).send({ name: 'Sicurezza' })).status).toBe(204);
    expect((await admin.patch('/api/categories/nope').send({ name: 'X Y' })).status).toBe(404);
  });
});

describe('caricamento', () => {
  it('DOCX: risposta immediata "in analisi", poi disponibile e ricercabile', async () => {
    const sara = await login(app(), 'sara');
    const res = await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('policy-resi.docx'));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'processing', title: 'policy resi', kind: 'docx', uploadedBy: 'sara', canDelete: true });
    await service.idle();
    const doc = (await sara.get(`/api/documents/${res.body.id}`)).body as DocumentDto;
    expect(doc).toMatchObject({ status: 'ready', sections: 3, errorMessage: null });
    const found = await new Retriever(new FakeEmbedder(), store, { maxDistance: 0.95 }).search('finestra di reso 30 giorni', { filtro: { documentId: doc.id } });
    expect(found.risultati[0]).toMatchObject({ documento: 'Policy resi e-commerce', sezione: 'Finestra di reso' });
    expect(embedCalls[0].userId).not.toBeNull();
  });

  it('nome file con accenti preservato, titolo personalizzato', async () => {
    const sara = await login(app(), 'sara');
    const res = await sara.post('/api/documents').field('categoryId', await categoryId()).field('title', 'Note magazzino Verona').attach('file', readFileSync(fx('note.txt')), 'note città.txt');
    expect(res.body).toMatchObject({ title: 'Note magazzino Verona', fileName: 'note città.txt' });
  });

  it('PDF scansionato: stato errore con motivo leggibile, nessuna sezione nel RAG', async () => {
    const sara = await login(app(), 'sara');
    const res = await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('scansione.pdf'));
    await service.idle();
    const doc = (await sara.get(`/api/documents/${res.body.id}`)).body as DocumentDto;
    expect(doc.status).toBe('error');
    expect(doc.errorMessage).toMatch(/scansione/);
    expect((await store.info())?.count ?? 0).toBe(0);
  });

  it.each([
    ['falso PDF', 'finto.pdf', 415],
    ['formato non ammesso', 'note.txt', 415, 'programma.exe'],
  ])('%s -> %i', async (_c, file, status, rename?: string) => {
    const sara = await login(app(), 'sara');
    const res = await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', readFileSync(fx(file)), rename ?? file);
    expect(res.status).toBe(status);
    expect(res.body.error).toMatch(/Formato non supportato/);
    expect(readdirSync(uploadDir)).toHaveLength(0);
  });

  it('file troppo grande: 413 con messaggio', async () => {
    const sara = await login(app(), 'sara');
    const res = await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', Buffer.alloc(70 * 1024, 'a'), 'grande.txt');
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/limite/);
  });

  it('stesso file nella stessa categoria: 409; in un’altra categoria è ammesso', async () => {
    const sara = await login(app(), 'sara');
    await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('note.txt'));
    const dup = await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('note.txt'));
    expect(dup.status).toBe(409);
    expect((await sara.post('/api/documents').field('categoryId', await categoryId('Organizzazione e FAQ')).attach('file', fx('note.txt'))).status).toBe(202);
  });

  it('categoria inesistente o file mancante: errore', async () => {
    const sara = await login(app(), 'sara');
    expect((await sara.post('/api/documents').field('categoryId', 'nope').attach('file', fx('note.txt'))).status).toBe(404);
    expect((await sara.post('/api/documents').field('categoryId', await categoryId())).status).toBe(400);
  });

  it('senza login: 401', async () => {
    // Senza allegato: con un upload in corso il server chiude la connessione appena risponde 401
    // e il client può vedere un errore di rete invece dello stato (comportamento corretto ma instabile da testare).
    expect((await request(app()).post('/api/documents').field('categoryId', 'x')).status).toBe(401);
    expect((await request(app()).get('/api/documents')).status).toBe(401);
  });
});

describe('elenco ed eliminazione', () => {
  it('filtri per categoria e testo; canDelete secondo autore e ruolo', async () => {
    const a = app();
    const sara = await login(a, 'sara');
    const luca = await login(a, 'luca');
    await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('note.txt'));
    await service.idle();
    const perCat = (await luca.get(`/api/documents?categoria=${await categoryId()}`)).body as DocumentDto[];
    expect(perCat).toHaveLength(1);
    expect(perCat[0].canDelete).toBe(false);
    expect((await luca.get('/api/documents?q=note')).body).toHaveLength(1);
    expect((await luca.get('/api/documents?q=inesistente')).body).toHaveLength(0);
  });

  it('elimina l’autore o l’admin, non gli altri; le sezioni spariscono dal RAG', async () => {
    const a = app();
    const sara = await login(a, 'sara');
    const luca = await login(a, 'luca');
    const admin = await login(a, 'admin', 'ADMIN');
    const id = (await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('policy-resi.docx'))).body.id;
    const id2 = (await sara.post('/api/documents').field('categoryId', await categoryId()).attach('file', fx('note.txt'))).body.id;
    await service.idle();
    expect((await luca.delete(`/api/documents/${id}`)).status).toBe(403);
    expect((await sara.delete(`/api/documents/${id}`)).status).toBe(204);
    expect((await admin.delete(`/api/documents/${id2}`)).status).toBe(204);
    expect((await store.info())?.count).toBe(0);
    expect(readdirSync(uploadDir)).toHaveLength(0);
    expect((await sara.get(`/api/documents/${id}`)).status).toBe(404);
  });
});

describe('knowledge base originale e reindicizzazione', () => {
  const KB = resolve(ROOT, 'knowledge_base/source');

  it('registra i 10 documenti nelle loro categorie (idempotente) e li indicizza', async () => {
    expect(await service.registerSeedDocuments(KB)).toBe(10);
    expect(await service.registerSeedDocuments(KB)).toBe(0);
    const res = await service.reindexAll();
    expect(res).toEqual({ documents: 10, ready: 10, errors: 0 });
    const cats = await service.categories();
    expect(cats.find((c) => c.name === 'Reclami e giacenze')).toMatchObject({ documents: 2, ready: 2 });
    const sla = await new Retriever(new FakeEmbedder(), store, { maxDistance: 0.95 }).search('penale per punto', { cliente: 'TechPoint' });
    expect(sla.risultati[0]).toMatchObject({ sezione: 'TechPoint' });
  });

  it('i documenti di sistema non hanno autore e non si eliminano dal disco', async () => {
    await service.registerSeedDocuments(KB);
    const admin = await login(app(), 'admin', 'ADMIN');
    const [doc] = (await admin.get('/api/documents?q=FAQ')).body as DocumentDto[];
    expect(doc).toMatchObject({ uploadedBy: 'Sistema', origin: 'seed', canDelete: true });
    expect((await admin.delete(`/api/documents/${doc.id}`)).status).toBe(204);
    expect(readFileSync(resolve(KB, '10_faq_customer_service.md'), 'utf8')).toContain('FAQ');
  });

  it('riprende i documenti rimasti in analisi', async () => {
    await service.registerSeedDocuments(KB);
    expect(await service.resumePending()).toBe(10);
    await service.idle();
    expect(await prisma.document.count({ where: { status: 'ready' } })).toBe(10);
  });
});
