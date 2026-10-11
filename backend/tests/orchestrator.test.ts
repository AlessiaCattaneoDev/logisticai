import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeLLMProvider, type FakeTurn } from '../src/llm/fake';
import { Orchestrator, type OrchestratorEvent, type OrchestratorOutcome } from '../src/orchestrator/agent';
import { buildSystemPrompt } from '../src/orchestrator/systemPrompt';
import type { RetrievalResult } from '../src/rag/retriever';
import { DataAgentError, type AnalyzeInput, type AnalyzeOutput } from '../src/services/dataAgentClient';

const chart = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/contracts/fixtures/valid/chart_line_sla.json'), 'utf8'));

const kbResult: RetrievalResult = {
  trovato: true,
  risultati: [{ documento: 'Schede SLA per cliente', sezione: 'ModaNova', cliente: 'ModaNova', testo: 'Soglia 95%, penale 1.000 € per punto, tetto 5.000 €', rilevanza: 0.8 }],
  embedding: { provider: 'fake', model: 'fake-embedding', inputTokens: 12, latencyMs: 3 },
};

const dataResult: AnalyzeOutput = {
  sintesi: 'Puntualità settembre 93,3%: penale 1.700 €',
  artifacts: [chart],
  artifacts_riepilogo: ["grafico line: 'Puntualità ModaNova' (4 punti)"],
  codice_eseguito: ['d = pulisci_dataset()'],
  pulizia: ['Rimosse 240 righe duplicate'],
  righe_analizzate: 11987,
  usage: [{ provider: 'openai', model: 'data-model', input_tokens: 900, output_tokens: 120, latency_ms: 2000 }],
  scartati: 0,
};

function setup(script: FakeTurn[], overrides: { search?: () => Promise<RetrievalResult>; analyze?: (i: AnalyzeInput) => Promise<AnalyzeOutput>; maxIterations?: number } = {}) {
  const llm = new FakeLLMProvider(script);
  const searches: { query: string; opts: unknown }[] = [];
  const analyses: AnalyzeInput[] = [];
  const orchestrator = new Orchestrator({
    llm,
    model: 'orch-model',
    systemPrompt: buildSystemPrompt(['ModaNova', 'TechPoint']),
    retriever: { search: async (query, opts) => { searches.push({ query, opts }); return overrides.search ? overrides.search() : kbResult; } },
    dataAgent: { analyze: async (i) => { analyses.push(i); return overrides.analyze ? overrides.analyze(i) : dataResult; } },
    maxIterations: overrides.maxIterations,
  });
  return { llm, orchestrator, searches, analyses };
}

async function drain(gen: AsyncGenerator<OrchestratorEvent, OrchestratorOutcome>) {
  const events: OrchestratorEvent[] = [];
  for (;;) {
    const { value, done } = await gen.next();
    if (done) return { events, outcome: value };
    events.push(value);
  }
}

const input = { history: [], message: 'domanda', userId: 'u1' };

describe('Orchestrator', () => {
  it('saluto: risponde senza strumenti e trasmette il testo in streaming', async () => {
    const { orchestrator, llm } = setup([{ text: 'Ciao! Mi occupo di spedizioni e SLA.' }]);
    const { events, outcome } = await drain(orchestrator.run({ ...input, message: 'ciao' }));
    expect(events[0]).toEqual({ event: 'status', data: { stage: 'thinking' } });
    expect(events.filter((e) => e.event === 'delta').map((e) => (e.data as { text: string }).text).join('')).toBe('Ciao! Mi occupo di spedizioni e SLA.');
    expect(outcome).toMatchObject({ reply: 'Ciao! Mi occupo di spedizioni e SLA.', toolsUsed: [], stoppedBy: 'answer' });
    expect(llm.requests[0].tools?.map((t) => t.name)).toEqual(['cerca_knowledge_base', 'analizza_dati']);
    expect(llm.requests[0].system).toContain('ModaNova, TechPoint');
  });

  it('domanda documentale: chiama la KB, raccoglie le fonti, passa gli estratti al modello', async () => {
    const { orchestrator, llm, searches } = setup([
      { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'penale', cliente: 'ModaNova' } }] },
      { text: 'La penale è 1.000 € per punto (Schede SLA per cliente > ModaNova).' },
    ]);
    const { events, outcome } = await drain(orchestrator.run(input));
    expect(searches).toEqual([{ query: 'penale', opts: { cliente: 'ModaNova', topK: undefined } }]);
    expect(events.map((e) => e.event)).toContain('tool_start');
    expect(outcome.sources).toEqual([{ documento: 'Schede SLA per cliente', sezione: 'ModaNova' }]);
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool')!;
    expect(JSON.parse((toolMsg as { content: string }).content)).toMatchObject({ trovato: true, risultati: [{ sezione: 'ModaNova' }] });
  });

  it('catena RAG -> dati: le regole trovate arrivano al data agent, gli artifact all’utente ma non al modello', async () => {
    const { orchestrator, llm, analyses } = setup([
      { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'SLA penali', cliente: 'ModaNova' } }] },
      { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'puntualità ModaNova settembre 2026', genera_grafico: true, regole_da_applicare: 'soglia 95%, 1.000 € per punto' } }] },
      { text: 'Sì: penale di 1.700,00 €.' },
    ]);
    const { events, outcome } = await drain(orchestrator.run(input));
    expect(analyses[0].regole_da_applicare).toContain('soglia 95%');
    expect(events.filter((e) => e.event === 'artifact')).toHaveLength(1);
    expect(outcome.artifacts).toEqual([chart]);
    expect(outcome.toolsUsed.map((t) => t.name)).toEqual(['cerca_knowledge_base', 'analizza_dati']);
    expect(outcome.dataAgent).toEqual({ codice: ['d = pulisci_dataset()'], pulizia: ['Rimosse 240 righe duplicate'], righeAnalizzate: 11987 });
    const lastToolMsg = llm.requests[2].messages.filter((m) => m.role === 'tool').at(-1) as { content: string };
    expect(lastToolMsg.content).not.toContain('"data"');
    expect(JSON.parse(lastToolMsg.content).grafici_e_tabelle_gia_mostrati_all_utente).toEqual(["grafico line: 'Puntualità ModaNova' (4 punti)"]);
  });

  it('registra le chiamate a modelli di orchestratore, embedding e data agent', async () => {
    const { orchestrator } = setup([
      { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'x y' } }] },
      { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'tasso danni', genera_grafico: true } }] },
      { text: 'fatto' },
    ]);
    const { outcome } = await drain(orchestrator.run(input));
    expect(outcome.llmCalls.map((c) => c.component).sort()).toEqual(['data_agent', 'embedding', 'orchestrator', 'orchestrator', 'orchestrator']);
    expect(outcome.llmCalls.find((c) => c.component === 'data_agent')).toMatchObject({ model: 'data-model', usage: { inputTokens: 900, outputTokens: 120 } });
  });

  it('regole e dati chiesti insieme: l’analisi è rinviata finché il modello non ha letto le regole', async () => {
    const { orchestrator, llm, searches, analyses } = setup([
      { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'SLA ModaNova' } }, { name: 'analizza_dati', args: { domanda: 'penale ModaNova settembre', genera_grafico: true } }] },
      { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'penale ModaNova settembre', genera_grafico: true, regole_da_applicare: 'Soglia 95%, escludere Destinatario assente' } }] },
      { text: 'Penale di 1.700,00 €.' },
    ]);
    const { outcome } = await drain(orchestrator.run(input));
    expect(searches).toHaveLength(1);
    expect(analyses).toEqual([expect.objectContaining({ regole_da_applicare: 'Soglia 95%, escludere Destinatario assente' })]);
    const deferred = llm.requests[1].messages.filter((m) => m.role === 'tool') as { toolCallId: string; content: string; isError: boolean }[];
    expect(deferred.map((t) => t.toolCallId)).toEqual(['call_1_0', 'call_1_1']);
    expect(deferred[1]).toMatchObject({ isError: true, content: expect.stringMatching(/rinviata/) });
    expect(outcome.toolsUsed.map((t) => [t.name, t.ok])).toEqual([['cerca_knowledge_base', true], ['analizza_dati', false], ['analizza_dati', true]]);
  });

  it('chiamate parallele indipendenti (senza regole) eseguite insieme', async () => {
    const { orchestrator, analyses } = setup([
      { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'danni per vettore', genera_grafico: true } }, { name: 'analizza_dati', args: { domanda: 'puntualità per hub', genera_grafico: true } }] },
      { text: 'ok' },
    ]);
    await drain(orchestrator.run(input));
    expect(analyses).toHaveLength(2);
  });

  it('argomenti non validi: errore restituito al modello, che può correggersi', async () => {
    const { orchestrator, llm, analyses } = setup([
      { toolCalls: [{ name: 'analizza_dati', args: { domanda: 'x' } }] },
      { text: 'Riformulo.' },
    ]);
    const { outcome } = await drain(orchestrator.run(input));
    expect(analyses).toHaveLength(0);
    expect(outcome.toolsUsed[0]).toMatchObject({ name: 'analizza_dati', ok: false });
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool') as { content: string; isError: boolean };
    expect(toolMsg.isError).toBe(true);
    expect(toolMsg.content).toMatch(/Argomenti non validi: domanda/);
  });

  it('strumento sconosciuto o argomenti JSON rotti: nessuna eccezione', async () => {
    const { orchestrator } = setup([
      { toolCalls: [{ name: 'cancella_database', args: {} }, { name: 'cerca_knowledge_base', args: {}, argsError: 'argomenti JSON non validi' }] },
      { text: 'ok' },
    ]);
    const { outcome } = await drain(orchestrator.run(input));
    expect(outcome.toolsUsed.map((t) => t.ok)).toEqual([false, false]);
  });

  it('errore del data agent: il modello lo spiega all’utente', async () => {
    const { orchestrator, llm } = setup(
      [{ toolCalls: [{ name: 'analizza_dati', args: { domanda: 'margini 2026', genera_grafico: false } }] }, { text: 'Il servizio di analisi non risponde.' }],
      { analyze: async () => { throw new DataAgentError('Il servizio di analisi dati non è raggiungibile'); } },
    );
    const { outcome } = await drain(orchestrator.run(input));
    expect(outcome.toolLog[0]).toMatchObject({ ok: false, error: 'Il servizio di analisi dati non è raggiungibile' });
    expect((llm.requests[1].messages.at(-1) as { content: string }).content).toMatch(/non è raggiungibile/);
  });

  it('KB senza risultati: il modello riceve l’istruzione di non inventare', async () => {
    const { orchestrator, llm } = setup(
      [{ toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'policy ferie' } }] }, { text: 'Non trovo questa informazione nei documenti.' }],
      { search: async () => ({ trovato: false, risultati: [], embedding: kbResult.embedding }) },
    );
    const { outcome } = await drain(orchestrator.run(input));
    expect(outcome.sources).toEqual([]);
    expect((llm.requests[1].messages.at(-1) as { content: string }).content).toContain('non inventare');
  });

  it('limite di iterazioni: si ferma con una nota', async () => {
    const loop: FakeTurn = { toolCalls: [{ name: 'cerca_knowledge_base', args: { query: 'ancora' } }] };
    const { orchestrator, llm } = setup([loop, loop, loop], { maxIterations: 3 });
    const { outcome } = await drain(orchestrator.run(input));
    expect(llm.callCount).toBe(3);
    expect(outcome.stoppedBy).toBe('max_iterations');
    expect(outcome.reply).toMatch(/numero massimo di passaggi/);
  });

  it('la cronologia precede il nuovo messaggio', async () => {
    const { orchestrator, llm } = setup([{ text: 'ok' }]);
    await drain(orchestrator.run({ ...input, history: [{ role: 'user', content: 'prima' }, { role: 'assistant', content: 'risposta' }], message: 'E solo per ModaNova?' }));
    expect(llm.requests[0].messages.map((m) => (m as { content: string }).content)).toEqual(['prima', 'risposta', 'E solo per ModaNova?']);
  });

  it('rifiuto del modello: risposta di cortesia, nessuno strumento', async () => {
    const { orchestrator } = setup([{ text: '', refusal: true }]);
    const { outcome } = await drain(orchestrator.run(input));
    expect(outcome.stoppedBy).toBe('refusal');
    expect(outcome.reply).toMatch(/Non posso rispondere/);
  });

  it('errore del provider LLM: propagato al chiamante', async () => {
    const { orchestrator } = setup([{ error: new Error('provider giù') }]);
    await expect(drain(orchestrator.run(input))).rejects.toThrow('provider giù');
  });
});

describe('system prompt', () => {
  it('contiene le regole di routing e di ambito', () => {
    const p = buildSystemPrompt(['ModaNova']);
    expect(p).toMatch(/PRIMA cerca le regole, POI chiama analizza_dati/);
    expect(p).toMatch(/NON rispondere nel merito/);
    expect(p).toMatch(/numeri chiave/);
    expect(p).toMatch(/Completa sempre la catena/);
    expect(p).not.toContain(String.fromCharCode(0x2014));
  });
});
