import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatResponse, ConversationDetail } from '@logisticai/shared';
import { ChatService } from '../src/chat/service';
import { FakeLLMProvider, type FakeTurn } from '../src/llm/fake';
import { LLMError } from '../src/llm/types';
import { Orchestrator } from '../src/orchestrator/agent';
import { TelemetryRecorder } from '../src/telemetry/recorder';
import { buildTestApp, createUser } from './helpers/testApp';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const chart = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/contracts/fixtures/valid/chart_line_sla.json'), 'utf8'));

function appWith(script: FakeTurn[]) {
  const llm = new FakeLLMProvider(script);
  const orchestrator = new Orchestrator({
    llm,
    model: 'orch-model',
    systemPrompt: 'test',
    retriever: {
      search: async () => ({
        trovato: true,
        risultati: [{ documento: 'Schede SLA per cliente', sezione: 'ModaNova', testo: 'Soglia 95%', rilevanza: 0.9 }],
        embedding: { provider: 'openai', model: 'emb', inputTokens: 10, latencyMs: 2 },
      }),
    },
    dataAgent: {
      analyze: async () => ({
        sintesi: 'Puntualità 93,3%', artifacts: [chart], artifacts_riepilogo: ['grafico line'], codice_eseguito: ['d = pulisci_dataset()'],
        pulizia: ['Rimosse 240 righe duplicate'], righe_analizzate: 11987,
        usage: [{ provider: 'openai', model: 'data-model', input_tokens: 1000, output_tokens: 100, latency_ms: 900 }], scartati: 0,
      }),
    },
  });
  const service = new ChatService(prisma, orchestrator, new TelemetryRecorder(prisma, 0.9));
  return { app: buildTestApp(prisma, { chat: { service, rateLimit: { windowMs: 60_000, limit: 1000 } } }), llm };
}

async function login(app: ReturnType<typeof buildTestApp>, username = 'sara') {
  await createUser(prisma, username, 'Password!2026');
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'Password!2026' });
  return agent;
}

function parseSse(text: string) {
  return text.trim().split('\n\n').map((block) => {
    const [ev, data] = block.split('\n');
    return { event: ev.replace('event: ', ''), data: JSON.parse(data.replace('data: ', '')) };
  });
}

const PENALE: FakeTurn[] = [
  { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'penale', cliente: 'ModaNova' } }] },
  { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'puntualità ModaNova settembre', genera_grafico: true, regole_da_applicare: 'soglia 95%' } }] },
  { text: 'Sì, penale di 1.700,00 €.' },
];

describe('POST /api/chat', () => {
  it('richiede il login', async () => {
    const { app } = appWith([]);
    expect((await request(app).post('/api/chat').send({ message: 'ciao' })).status).toBe(401);
  });

  it('400 con messaggio vuoto o troppo lungo', async () => {
    const agent = await login(appWith([]).app);
    expect((await agent.post('/api/chat').send({ message: '   ' })).status).toBe(400);
    expect((await agent.post('/api/chat').send({ message: 'x'.repeat(4001) })).status).toBe(400);
  });

  it('stream SSE con stati live, artifact e risposta finale', async () => {
    const agent = await login(appWith(PENALE).app);
    const res = await agent.post('/api/chat').send({ message: 'ModaNova ha diritto a penali per settembre?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.text);
    const names = events.map((e) => e.event);
    expect(names.slice(0, 2)).toEqual(['start', 'status']);
    expect(names.filter((n) => n === 'tool_start')).toHaveLength(2);
    expect(names.indexOf('artifact')).toBeLessThan(names.indexOf('done'));
    const done = events.at(-1)!.data as ChatResponse;
    expect(done.reply).toBe('Sì, penale di 1.700,00 €.');
    expect(done.artifacts).toHaveLength(1);
    expect(done.sources).toEqual([{ documento: 'Schede SLA per cliente', sezione: 'ModaNova' }]);
    expect(done.toolsUsed.map((t) => t.name)).toEqual(['cerca_knowledge_base', 'analizza_dati']);
    expect(done.dataAgent?.righeAnalizzate).toBe(11987);
    expect(done.usage.latencyMs).toBeGreaterThanOrEqual(0);
    expect(events[0].data).toEqual({ conversationId: done.conversationId });
  });

  it('salva conversazione, messaggi, tool, artifact e costi', async () => {
    await prisma.modelPricing.create({ data: { provider: 'fake', model: 'orch-model', inputPer1M: 1, outputPer1M: 2, validFrom: new Date('2020-01-01') } });
    const agent = await login(appWith(PENALE).app);
    const done = parseSse((await agent.post('/api/chat').send({ message: 'ModaNova ha diritto a penali per settembre?' })).text).at(-1)!.data as ChatResponse;
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: done.conversationId } });
    expect(conv.title).toBe('ModaNova ha diritto a penali per settembre?');
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(2);
    expect(await prisma.toolCall.count({ where: { messageId: done.messageId } })).toBe(2);
    expect((await prisma.messageArtifact.findMany({ where: { messageId: done.messageId } })).map((a) => a.type)).toEqual(['chart', 'source', 'data_agent']);
    const calls = await prisma.llmCall.findMany({ where: { messageId: done.messageId } });
    expect(calls.map((c) => c.component).sort()).toEqual(['data_agent', 'embedding', 'orchestrator', 'orchestrator', 'orchestrator']);
    expect(calls.every((c) => c.conversationId === conv.id && c.userId === conv.userId)).toBe(true);
    expect(done.usage.costEur).toBeGreaterThan(0);
  });

  it('la cronologia della conversazione arriva al modello', async () => {
    const { app, llm } = appWith([{ text: 'Prima risposta' }, { text: 'Seconda risposta' }]);
    const agent = await login(app);
    const first = parseSse((await agent.post('/api/chat').send({ message: 'Puntualità per hub?' })).text).at(-1)!.data as ChatResponse;
    await agent.post('/api/chat').send({ conversationId: first.conversationId, message: 'E solo per ModaNova?' });
    expect(llm.requests[1].messages.map((m) => (m as { content: string }).content)).toEqual(['Puntualità per hub?', 'Prima risposta', 'E solo per ModaNova?']);
  });

  it('non si può scrivere nella conversazione di un altro utente', async () => {
    const { app } = appWith([{ text: 'ok' }]);
    const other = await createUser(prisma, 'luca', 'Password!2026');
    const conv = await prisma.conversation.create({ data: { userId: other.id, title: 'privata' } });
    const agent = await login(app);
    expect((await agent.post('/api/chat').send({ conversationId: conv.id, message: 'ciao' })).status).toBe(404);
  });

  it('errore del modello: evento error e messaggio salvato con stato error', async () => {
    const agent = await login(appWith([{ error: new LLMError('rate limit', 'openai', true) }]).app);
    const events = parseSse((await agent.post('/api/chat').send({ message: 'ciao' })).text);
    expect(events.at(-1)).toEqual({ event: 'error', data: { message: expect.stringMatching(/errore/), retryable: true } });
    const saved = await prisma.message.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
    expect(saved.status).toBe('error');
  });

  it("interruzione dell'utente: il segnale ferma l'orchestratore, nessun evento error, risposta salvata come interrotta", async () => {
    const user = await createUser(prisma, 'sara', 'Password!2026');
    const conv = await prisma.conversation.create({ data: { userId: user.id, title: 't' } });
    const seen: AbortSignal[] = [];
    const orchestrator = {
      async *run(input: { signal?: AbortSignal }) {
        seen.push(input.signal!);
        yield { event: 'status' as const, data: { stage: 'thinking' as const } };
        if (!input.signal!.aborted) await new Promise((resolve) => input.signal!.addEventListener('abort', resolve));
        throw new Error('aborted');
      },
    } as unknown as Orchestrator;
    const service = new ChatService(prisma, orchestrator, new TelemetryRecorder(prisma, 0.9));
    const abort = new AbortController();
    const events: string[] = [];
    for await (const e of service.handle({ userId: user.id, conversationId: conv.id, message: 'domanda lunga', signal: abort.signal })) {
      events.push(e.event);
      abort.abort();
    }
    expect(seen[0].aborted).toBe(true);
    expect(events).toEqual(['status']);
    const saved = await prisma.message.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
    expect(saved).toMatchObject({ status: 'error', content: 'Risposta interrotta.' });
  });
});

describe('conversazioni', () => {
  async function withConversation() {
    const { app } = appWith(PENALE);
    const agent = await login(app);
    const done = parseSse((await agent.post('/api/chat').send({ message: 'Penale ModaNova?' })).text).at(-1)!.data as ChatResponse;
    return { app, agent, done };
  }

  it('elenco e dettaglio con artifact, fonti e strumenti', async () => {
    const { agent, done } = await withConversation();
    const list = (await agent.get('/api/conversations')).body;
    expect(list).toEqual([{ id: done.conversationId, title: 'Penale ModaNova?', updatedAt: expect.any(String) }]);
    const detail = (await agent.get(`/api/conversations/${done.conversationId}`)).body as ConversationDetail;
    expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const reply = detail.messages[1];
    expect(reply.artifacts).toEqual([chart]);
    expect(reply.sources).toHaveLength(1);
    expect(reply.toolsUsed.map((t) => t.name)).toEqual(['cerca_knowledge_base', 'analizza_dati']);
    expect(reply.dataAgent?.pulizia).toEqual(['Rimosse 240 righe duplicate']);
  });

  it('un altro utente non vede la conversazione', async () => {
    const { app, done } = await withConversation();
    const luca = await login(app, 'luca');
    expect((await luca.get(`/api/conversations/${done.conversationId}`)).status).toBe(404);
    expect((await luca.get('/api/conversations')).body).toEqual([]);
  });

  it('archiviare la rimuove dall’elenco', async () => {
    const { agent, done } = await withConversation();
    expect((await agent.delete(`/api/conversations/${done.conversationId}`)).status).toBe(204);
    expect((await agent.get('/api/conversations')).body).toEqual([]);
    expect((await agent.get(`/api/conversations/${done.conversationId}`)).status).toBe(404);
  });
});

describe('feedback', () => {
  it('pollice giù con motivo, poi cambio idea: un solo feedback per messaggio', async () => {
    const { app } = appWith([{ text: 'risposta' }]);
    const agent = await login(app);
    const done = parseSse((await agent.post('/api/chat').send({ message: 'q' })).text).at(-1)!.data as ChatResponse;
    const down = await agent.post(`/api/messages/${done.messageId}/feedback`).send({ rating: 'down', reason: 'Numeri sbagliati', comment: 'il totale non torna' });
    expect(down.status).toBe(200);
    expect(await prisma.feedback.findUniqueOrThrow({ where: { messageId: done.messageId } })).toMatchObject({ rating: 'down', reason: 'Numeri sbagliati', status: 'new' });
    await agent.post(`/api/messages/${done.messageId}/feedback`).send({ rating: 'up' });
    expect(await prisma.feedback.count()).toBe(1);
    expect(await prisma.feedback.findUniqueOrThrow({ where: { messageId: done.messageId } })).toMatchObject({ rating: 'up', reason: null });
    const detail = (await agent.get(`/api/conversations/${done.conversationId}`)).body as ConversationDetail;
    expect(detail.messages[1].feedback).toBe('up');
  });

  it('motivo non ammesso: 400', async () => {
    const agent = await login(appWith([]).app);
    expect((await agent.post('/api/messages/x/feedback').send({ rating: 'down', reason: 'Inventato' })).status).toBe(400);
  });

  it('non si può votare un messaggio utente o di altri', async () => {
    const { app } = appWith([{ text: 'risposta' }]);
    const sara = await login(app);
    const done = parseSse((await sara.post('/api/chat').send({ message: 'q' })).text).at(-1)!.data as ChatResponse;
    const userMsg = await prisma.message.findFirstOrThrow({ where: { role: 'USER' } });
    expect((await sara.post(`/api/messages/${userMsg.id}/feedback`).send({ rating: 'up' })).status).toBe(404);
    const luca = await login(app, 'luca');
    expect((await luca.post(`/api/messages/${done.messageId}/feedback`).send({ rating: 'up' })).status).toBe(404);
  });
});

describe('conversazioni con ambito', () => {
  async function seedDoc(status = 'ready') {
    const cat = await prisma.documentCategory.create({ data: { name: 'Reclami e giacenze' } });
    const doc = await prisma.document.create({ data: { title: 'Procedura reclami e danni', fileName: 'p.md', kind: 'md', sizeBytes: 1, checksum: 'x', storagePath: 'p.md', categoryId: cat.id, status } });
    return { cat, doc };
  }

  it('l’ambito si salva sulla conversazione e torna nell’elenco e nel dettaglio', async () => {
    const { doc } = await seedDoc();
    const { app, llm } = appWith([{ text: 'Entro 8 giorni.' }, { text: 'Sì.' }]);
    const agent = await login(app);
    const res = await agent.post('/api/chat').send({ message: 'Entro quanto?', scope: { type: 'document', id: doc.id } });
    const done = parseSse(res.text).at(-1)!.data as ChatResponse;
    expect(llm.requests[0].tools?.map((t) => t.name)).toEqual(['cerca_knowledge_base']);
    const list = (await agent.get('/api/conversations')).body;
    expect(list[0].scope).toEqual({ type: 'document', id: doc.id, label: 'Procedura reclami e danni' });
    // Messaggio successivo senza scope nel corpo: l'ambito resta quello della conversazione
    await agent.post('/api/chat').send({ conversationId: done.conversationId, message: 'E con foto?' });
    expect(llm.requests[1].tools?.map((t) => t.name)).toEqual(['cerca_knowledge_base']);
    expect((await agent.get(`/api/conversations/${done.conversationId}`)).body.scope.label).toBe('Procedura reclami e danni');
  });

  it('documento non disponibile o categoria inesistente: 400', async () => {
    const { doc } = await seedDoc('processing');
    const agent = await login(appWith([]).app);
    expect((await agent.post('/api/chat').send({ message: 'x', scope: { type: 'document', id: doc.id } })).status).toBe(400);
    expect((await agent.post('/api/chat').send({ message: 'x', scope: { type: 'category', id: 'nope' } })).status).toBe(400);
    expect((await agent.post('/api/chat').send({ message: 'x', scope: { type: 'altro', id: 'x' } })).status).toBe(400);
  });
});
