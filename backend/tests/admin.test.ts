import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminConversationDetail, AdminConversationRow, AdminCosts, AdminFeedbackRow, AdminOverview, AdminUserRow, ChatResponse } from '@logisticai/shared';
import { AdminService } from '../src/admin/service';
import { ChatService } from '../src/chat/service';
import { FakeLLMProvider } from '../src/llm/fake';
import { LLMError } from '../src/llm/types';
import { Orchestrator } from '../src/orchestrator/agent';
import { TelemetryRecorder } from '../src/telemetry/recorder';
import { buildTestApp, createUser } from './helpers/testApp';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

function setup(script: ConstructorParameters<typeof FakeLLMProvider>[0]) {
  const orchestrator = new Orchestrator({
    llm: new FakeLLMProvider(script),
    model: 'orch-model',
    systemPrompt: 'test',
    retriever: { search: async () => ({ trovato: true, risultati: [{ documento: 'D', sezione: 'S', testo: 't', rilevanza: 1 }], embedding: { provider: 'fake', model: 'emb', inputTokens: 5, latencyMs: 1 } }) },
    dataAgent: { analyze: async () => ({ sintesi: 's', artifacts: [], artifacts_riepilogo: [], codice_eseguito: [], pulizia: [], righe_analizzate: 1, usage: [], scartati: 0 }) },
  });
  const chat = new ChatService(prisma, orchestrator, new TelemetryRecorder(prisma, 1));
  const admin = new AdminService({ prisma, chat, budgets: { dailyEur: 5, monthlyEur: 50, usdEurRate: 1 }, models: { orchestrator: 'fake:orch-model', dataAgent: 'fake:data', embedding: 'fake:emb' } });
  return buildTestApp(prisma, { chat: { service: chat, rateLimit: { windowMs: 60_000, limit: 1000 } }, admin });
}

async function agentFor(app: ReturnType<typeof setup>, username: string, role: 'OPERATOR' | 'ADMIN') {
  await createUser(prisma, username, 'Password!2026', role);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'Password!2026' });
  return agent;
}

const done = (text: string) => JSON.parse(text.trim().split('\n\n').at(-1)!.split('\n')[1].slice(6)) as ChatResponse;

async function scenario() {
  await prisma.modelPricing.create({ data: { provider: 'fake', model: 'orch-model', inputPer1M: 1000, outputPer1M: 1000, validFrom: new Date('2020-01-01') } });
  const app = setup([
    { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'sla' } }] },
    { text: 'Risposta documentale' },
    { text: 'Ciao' },
    { error: new LLMError('giù', 'fake', true) },
  ]);
  const admin = await agentFor(app, 'admin', 'ADMIN');
  const sara = await agentFor(app, 'sara', 'OPERATOR');
  const r1 = done((await sara.post('/api/chat').send({ message: 'Penale ModaNova?' })).text);
  const r2 = done((await sara.post('/api/chat').send({ message: 'ciao' })).text);
  await sara.post('/api/chat').send({ message: 'questa fallisce' });
  await sara.post(`/api/messages/${r1.messageId}/feedback`).send({ rating: 'down', reason: 'Numeri sbagliati', comment: 'totale errato' });
  await sara.post(`/api/messages/${r2.messageId}/feedback`).send({ rating: 'up' });
  return { app, admin, sara, r1 };
}

describe('accesso alla dashboard', () => {
  it('401 senza login, 403 per operatori', async () => {
    const app = setup([]);
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
    const sara = await agentFor(app, 'sara', 'OPERATOR');
    expect((await sara.get('/api/admin/overview')).status).toBe(403);
  });

  it('periodo non valido: 400', async () => {
    const admin = await agentFor(setup([]), 'admin', 'ADMIN');
    expect((await admin.get('/api/admin/overview?da=2026-10-10&a=2026-01-01')).status).toBe(400);
    expect((await admin.get('/api/admin/overview?da=ieri')).status).toBe(400);
  });
});

describe('panoramica', () => {
  it('KPI di costo, richieste, feedback, errori e decisioni dell’agente', async () => {
    const { admin } = await scenario();
    const o = (await admin.get('/api/admin/overview')).body as AdminOverview;
    expect(o.kpi.richieste).toBe(3);
    expect(o.kpi.conversazioni).toBe(3);
    expect(o.kpi.costoPeriodoEur).toBeGreaterThan(0);
    expect(o.kpi.costoOggiEur).toBe(o.kpi.costoPeriodoEur);
    expect(o.kpi.costoMedioRichiestaEur).toBeCloseTo(o.kpi.costoPeriodoEur / 3, 3);
    expect(o.kpi.feedbackPositiviPct).toBe(0.5);
    expect(o.kpi.erroriPct).toBeCloseTo(1 / 3, 3);
    expect(o.kpi.utentiAttivi).toBe(1);
    expect(o.kpi.modelliSenzaPrezzo).toContain('fake:emb');
    expect(o.decisioni).toEqual(expect.arrayContaining([{ strategia: 'Solo documenti', richieste: 1 }, { strategia: 'Nessuno strumento', richieste: 1 }]));
    expect(o.giornaliero.at(-1)).toMatchObject({ richieste: 3, feedback_positivi: 1, feedback_negativi: 1 });
    expect(o.giornaliero).toHaveLength(30);
  });
});

describe('conversazioni', () => {
  it('elenco con pseudonimi, costi e filtro sulle risposte segnalate', async () => {
    const { admin } = await scenario();
    const rows = (await admin.get('/api/admin/conversations')).body as AdminConversationRow[];
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain('sara');
    expect(rows[0].utente.alias).toMatch(/^Utente #\d+$/);
    const down = (await admin.get('/api/admin/conversations?feedback=down')).body as AdminConversationRow[];
    expect(down.map((r) => r.titolo)).toEqual(['Penale ModaNova?']);
    expect((await admin.get('/api/admin/conversations?errori=true')).body).toHaveLength(1);
    expect((await admin.get('/api/admin/conversations?q=ciao')).body).toHaveLength(1);
  });

  it('dettaglio con trace di chiamate e strumenti, registrato nell’audit', async () => {
    const { admin, r1 } = await scenario();
    const d = (await admin.get(`/api/admin/conversations/${r1.conversationId}`)).body as AdminConversationDetail;
    const trace = d.trace[r1.messageId];
    expect(trace.chiamate.map((c) => c.componente)).toEqual(['orchestrator', 'embedding', 'orchestrator']);
    expect(trace.strumenti[0]).toMatchObject({ tool: 'cerca_knowledge_base', ok: true });
    expect(trace.costoEur).toBeGreaterThan(0);
    const audit = await prisma.auditLog.findMany();
    expect(audit).toEqual([expect.objectContaining({ action: 'apertura_conversazione', targetId: r1.conversationId })]);
  });

  it('conversazione inesistente: 404', async () => {
    const admin = await agentFor(setup([]), 'admin', 'ADMIN');
    expect((await admin.get('/api/admin/conversations/nope')).status).toBe(404);
  });
});

describe('feedback', () => {
  it('coda delle risposte segnalate con domanda e risposta, revisione tracciata', async () => {
    const { admin } = await scenario();
    const rows = (await admin.get('/api/admin/feedback')).body as AdminFeedbackRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 'down', motivo: 'Numeri sbagliati', commento: 'totale errato', stato: 'new', domanda: 'Penale ModaNova?', risposta: 'Risposta documentale' });
    expect((await admin.patch(`/api/admin/feedback/${rows[0].id}`).send({ stato: 'resolved', notaAdmin: 'Aggiunta FAQ' })).status).toBe(204);
    expect((await admin.get('/api/admin/feedback?stato=resolved')).body[0]).toMatchObject({ stato: 'resolved', notaAdmin: 'Aggiunta FAQ' });
    expect(await prisma.auditLog.count({ where: { action: 'revisione_feedback' } })).toBe(1);
    expect((await admin.patch('/api/admin/feedback/nope').send({ stato: 'resolved' })).status).toBe(404);
  });
});

describe('costi e listini', () => {
  it('ripartizione per modello e utente, listini, budget', async () => {
    const { admin } = await scenario();
    const c = (await admin.get('/api/admin/costs')).body as AdminCosts;
    expect(c.perModello.find((r) => r.componente === 'orchestrator')?.chiamate).toBe(3);
    expect(c.perUtente).toHaveLength(1);
    expect(c.listini).toHaveLength(1);
    expect(c.budget).toEqual({ giornalieroEur: 5, mensileEur: 50, cambioUsdEur: 1 });
  });

  it('nuovo listino e duplicato', async () => {
    const admin = await agentFor(setup([]), 'admin', 'ADMIN');
    const body = { provider: 'openai', modello: 'gpt-5.4-mini', inputPer1M: 0.75, outputPer1M: 4.5, cachedInputPer1M: 0.075, validoDal: '2026-10-01' };
    expect((await admin.post('/api/admin/pricing').send(body)).status).toBe(201);
    expect((await admin.post('/api/admin/pricing').send(body)).status).toBe(409);
    expect((await admin.post('/api/admin/pricing').send({ ...body, inputPer1M: -1 })).status).toBe(400);
  });
});

describe('utenti', () => {
  it('crea, disattiva, impedisce di disattivare se stessi', async () => {
    const app = setup([]);
    const admin = await agentFor(app, 'admin', 'ADMIN');
    const created = await admin.post('/api/admin/users').send({ username: 'luca.ops', password: 'Password!2026', ruolo: 'OPERATOR' });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/admin/users').send({ username: 'luca.ops', password: 'Password!2026', ruolo: 'OPERATOR' })).status).toBe(409);
    expect((await admin.post('/api/admin/users').send({ username: 'x', password: 'corta', ruolo: 'OPERATOR' })).status).toBe(400);
    expect((await admin.patch(`/api/admin/users/${created.body.id}`).send({ attivo: false })).status).toBe(204);
    const users = (await admin.get('/api/admin/users')).body as AdminUserRow[];
    expect(users.find((u) => u.username === 'luca.ops')?.attivo).toBe(false);
    const me = users.find((u) => u.username === 'admin')!;
    expect((await admin.patch(`/api/admin/users/${me.id}`).send({ attivo: false })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: { in: ['creazione_utente', 'modifica_utente'] } } })).toBe(2);
  });

  it('mostrare i nomi reali è un’azione registrata', async () => {
    const { admin } = await scenario();
    const names = (await admin.post('/api/admin/reveal-names')).body as Record<string, string>;
    expect(Object.values(names)).toEqual(expect.arrayContaining(['admin', 'sara']));
    expect((await admin.get('/api/admin/audit')).body[0]).toMatchObject({ admin: 'admin', azione: 'visualizzazione_nomi' });
  });
});

describe('sistema', () => {
  it('ultimi errori delle risposte', async () => {
    const { admin } = await scenario();
    const s = (await admin.get('/api/admin/system')).body;
    expect(s.ultimiErrori).toHaveLength(1);
  });
});
