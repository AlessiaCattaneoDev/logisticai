import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { HomeData } from '@logisticai/shared';
import { HomeService } from '../src/home/service';
import { buildTestApp, createUser } from './helpers/testApp';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const NOW = new Date('2026-10-12T12:00:00Z');
const app = () => buildTestApp(prisma, { home: new HomeService({ prisma, dailyBudgetEur: 5, now: () => NOW, services: async () => ({ chroma: 'ok', dataAgent: 'down' }) }) });

async function login(a: ReturnType<typeof app>, username: string, role: 'OPERATOR' | 'ADMIN' = 'OPERATOR') {
  const user = await createUser(prisma, username, 'Password!2026', role);
  const agent = request.agent(a);
  await agent.post('/api/auth/login').send({ username, password: 'Password!2026' });
  return { agent, user };
}

async function seed(userId: string) {
  const cat = await prisma.documentCategory.create({ data: { name: 'Reclami e giacenze' } });
  await prisma.document.create({ data: { title: 'Procedura reclami', fileName: 'a.md', kind: 'md', sizeBytes: 1, checksum: 'a', storagePath: 'a', categoryId: cat.id, status: 'ready' } });
  await prisma.document.create({ data: { title: 'Bozza', fileName: 'b.md', kind: 'md', sizeBytes: 1, checksum: 'b', storagePath: 'b', categoryId: cat.id, status: 'processing' } });
  const conv = await prisma.conversation.create({ data: { userId, title: 'Penale ModaNova?' } });
  const at = new Date('2026-10-11T09:00:00Z');
  await prisma.message.create({ data: { conversationId: conv.id, role: 'USER', content: 'q', createdAt: at } });
  const a1 = await prisma.message.create({ data: { conversationId: conv.id, role: 'ASSISTANT', content: 'r', createdAt: at, toolCalls: { create: [{ tool: 'cerca_knowledge_base', args: {}, durationMs: 1, ok: true, position: 0 }, { tool: 'analizza_dati', args: {}, durationMs: 1, ok: true, position: 1 }] } } });
  await prisma.message.create({ data: { conversationId: conv.id, role: 'USER', content: 'q2', createdAt: at } });
  await prisma.message.create({ data: { conversationId: conv.id, role: 'ASSISTANT', content: 'r2', createdAt: at } });
  await prisma.feedback.create({ data: { messageId: a1.id, userId, rating: 'up' } });
  await prisma.llmCall.create({ data: { component: 'orchestrator', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.1, costEur: 0.09, latencyMs: 1, createdAt: NOW } });
}

describe('GET /api/home', () => {
  it('operatore: i propri numeri, senza dati admin', async () => {
    const a = app();
    const { agent, user } = await login(a, 'sara');
    await seed(user.id);
    const h = (await agent.get('/api/home')).body as HomeData;
    expect(h.utente).toEqual({ nome: 'sara', ruolo: 'OPERATOR' });
    expect(h.kpi).toEqual({ documentiDisponibili: 1, categorie: 1, conversazioni: 1, domandeMese: 2, risposteUtiliPct: 1 });
    expect(h.domandePerTipo).toEqual(expect.arrayContaining([{ tipo: 'Documenti e dati', domande: 1 }, { tipo: 'Nessuno strumento', domande: 1 }]));
    expect(h.domandeGiornaliere).toHaveLength(14);
    expect(h.domandeGiornaliere.find((d) => d.giorno === '2026-10-11')?.domande).toBe(2);
    expect(h.conversazioniRecenti[0].title).toBe('Penale ModaNova?');
    expect(h.documentiRecenti.map((d) => d.status)).toEqual(expect.arrayContaining(['ready', 'processing']));
    expect(h.admin).toBeUndefined();
  });

  it('i numeri sono personali: un altro utente vede zero conversazioni', async () => {
    const a = app();
    const { user } = await login(a, 'sara');
    await seed(user.id);
    const { agent } = await login(a, 'luca');
    const h = (await agent.get('/api/home')).body as HomeData;
    expect(h.kpi).toMatchObject({ conversazioni: 0, domandeMese: 0, risposteUtiliPct: null, documentiDisponibili: 1 });
  });

  it('admin: costo di oggi, budget, segnalazioni e servizi', async () => {
    const a = app();
    const { agent } = await login(a, 'admin', 'ADMIN');
    const { user } = await login(a, 'sara');
    await seed(user.id);
    const h = (await agent.get('/api/home')).body as HomeData;
    expect(h.admin).toEqual({ costoOggiEur: 0.09, budgetGiornalieroEur: 5, segnalazioniDaRivedere: 0, servizi: { chroma: 'ok', dataAgent: 'down' } });
  });

  it('senza login: 401', async () => {
    expect((await request(app()).get('/api/home')).status).toBe(401);
  });
});
