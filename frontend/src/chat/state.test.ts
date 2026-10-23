import { describe, expect, it } from 'vitest';
import type { ChartSpec, ChatResponse } from '@logisticai/shared';
import { chatReducer, initialChatState, type ChatState } from './state';

const chart: ChartSpec = { kind: 'chart', id: 'c1', type: 'bar', title: 't', xKey: 'x', series: [{ key: 'y', label: 'Y' }], data: [{ x: 'a', y: 1 }] };

function sent(): ChatState {
  return chatReducer(initialChatState, { type: 'send', text: 'Penale ModaNova?', tempId: 't1' });
}

describe('chatReducer', () => {
  it('send: aggiunge domanda e risposta in attesa', () => {
    const s = sent();
    expect(s.pending).toBe(true);
    expect(s.messages.map((m) => [m.role, m.content, m.streaming ?? false])).toEqual([
      ['user', 'Penale ModaNova?', false],
      ['assistant', '', true],
    ]);
  });

  it('stati live: tool_start e tool_end aggiornano la timeline nell’ordine', () => {
    let s = sent();
    s = chatReducer(s, { type: 'event', event: { event: 'tool_start', data: { tool: 'cerca_knowledge_base', args: {} } } });
    s = chatReducer(s, { type: 'event', event: { event: 'tool_start', data: { tool: 'analizza_dati', args: {} } } });
    s = chatReducer(s, { type: 'event', event: { event: 'tool_end', data: { tool: 'analizza_dati', durationMs: 900, ok: false } } });
    expect(s.messages[1].steps).toEqual([
      { tool: 'cerca_knowledge_base', status: 'running' },
      { tool: 'analizza_dati', status: 'error', durationMs: 900 },
    ]);
  });

  it('delta e artifact arrivano prima di done', () => {
    let s = sent();
    s = chatReducer(s, { type: 'event', event: { event: 'delta', data: { text: 'Sì, ' } } });
    s = chatReducer(s, { type: 'event', event: { event: 'delta', data: { text: 'penale.' } } });
    s = chatReducer(s, { type: 'event', event: { event: 'artifact', data: chart } });
    expect(s.messages[1]).toMatchObject({ content: 'Sì, penale.', artifacts: [chart], streaming: true });
  });

  it('done: id definitivo, testo finale e dettagli', () => {
    const done: ChatResponse = {
      conversationId: 'c', messageId: 'm1', reply: 'Sì.\n\nPenale 1.700,00 €.', artifacts: [chart],
      sources: [{ documento: 'Schede SLA per cliente', sezione: 'ModaNova' }], toolsUsed: [],
      usage: { inputTokens: 1, outputTokens: 1, costEur: 0, latencyMs: 1 },
    };
    const s = chatReducer(sent(), { type: 'event', event: { event: 'done', data: done } });
    expect(s.pending).toBe(false);
    expect(s.messages[1]).toMatchObject({ id: 'm1', content: done.reply, streaming: false, sources: done.sources });
  });

  it('errore: messaggio leggibile, passi in corso marcati come falliti, riprovabile', () => {
    let s = chatReducer(sent(), { type: 'event', event: { event: 'tool_start', data: { tool: 'analizza_dati', args: {} } } });
    s = chatReducer(s, { type: 'event', event: { event: 'error', data: { message: 'Errore', retryable: true } } });
    expect(s.pending).toBe(false);
    expect(s.messages[1]).toMatchObject({ status: 'error', content: 'Errore', retryable: true, steps: [{ tool: 'analizza_dati', status: 'error' }] });
    expect(chatReducer(s, { type: 'dropLastExchange' }).messages).toEqual([]);
  });

  it('stop: tiene il testo arrivato, chiude i passi in corso, permette di riprovare', () => {
    let s = chatReducer(sent(), { type: 'event', event: { event: 'tool_start', data: { tool: 'analizza_dati', args: {} } } });
    s = chatReducer(s, { type: 'event', event: { event: 'delta', data: { text: 'Sto calcolando' } } });
    s = chatReducer(s, { type: 'stop' });
    expect(s.pending).toBe(false);
    expect(s.messages[1]).toMatchObject({ content: 'Sto calcolando', streaming: false, stopped: true, retryable: true, status: 'ok', steps: [{ tool: 'analizza_dati', status: 'error' }] });
  });

  it('load durante lo stream non sovrascrive i messaggi in arrivo', () => {
    const s = chatReducer(sent(), { type: 'load', messages: [] });
    expect(s.messages).toHaveLength(2);
    expect(s.pending).toBe(true);
  });

  it('feedback sul messaggio giusto', () => {
    const s = chatReducer(
      { pending: false, messages: [{ id: 'm1', role: 'assistant', content: 'x', status: 'ok', createdAt: '', artifacts: [], sources: [], toolsUsed: [] }] },
      { type: 'feedback', messageId: 'm1', rating: 'down' },
    );
    expect(s.messages[0].feedback).toBe('down');
  });
});
