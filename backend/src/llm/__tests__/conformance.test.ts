// Suite di conformità: gli stessi scenari devono dare lo stesso risultato neutro su ogni adapter.
// Un nuovo provider è compatibile con tutto il sistema se passa questa suite.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { AnthropicAdapter, type AnthropicLike } from '../adapters/anthropic';
import { OpenAIAdapter, type OpenAILike } from '../adapters/openai';
import { LLMError, type LLMProvider, type LLMRequest, type LLMStreamEvent } from '../types';

interface Scenario {
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  stop: 'end' | 'tool_calls' | 'max_tokens';
  usage: { input: number; cached: number; output: number };
}

interface Harness {
  name: string;
  make(s: Scenario | { error: number }): { provider: LLMProvider; sent: () => unknown };
}

const words = (t: string) => t.split(/(?<= )/).filter(Boolean);

const anthropicHarness: Harness = {
  name: 'anthropic',
  make(s) {
    let params: unknown;
    const client: AnthropicLike = {
      beta: {
        messages: {
          stream: ((p: unknown) => {
            params = p;
            if ('error' in s) throw new Anthropic.APIError(s.error, {}, `errore ${s.error}`, new Headers());
            const events = words(s.text).map((w, i) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: w }, i }));
            const content = [
              ...(s.text ? [{ type: 'text', text: s.text }] : []),
              ...s.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
            ];
            return {
              async *[Symbol.asyncIterator]() {
                yield* events;
              },
              finalMessage: async () => ({
                model: 'claude-test',
                content,
                stop_reason: { end: 'end_turn', tool_calls: 'tool_use', max_tokens: 'max_tokens' }[s.stop],
                usage: {
                  input_tokens: s.usage.input - 4,
                  cache_creation_input_tokens: 4,
                  cache_read_input_tokens: s.usage.cached,
                  output_tokens: s.usage.output,
                },
              }),
            };
          }) as unknown as AnthropicLike['beta']['messages']['stream'],
        },
      },
    };
    return { provider: new AnthropicAdapter({ client }), sent: () => params };
  },
};

const openaiHarness: Harness = {
  name: 'openai',
  make(s) {
    let params: unknown;
    const client: OpenAILike = {
      chat: {
        completions: {
          create: (async (p: unknown) => {
            params = p;
            if ('error' in s) throw new OpenAI.APIError(s.error, {}, `errore ${s.error}`, new Headers());
            const chunks: unknown[] = words(s.text).map((w) => ({ model: 'gpt-test', choices: [{ index: 0, delta: { content: w } }] }));
            s.toolCalls.forEach((c, index) => {
              const json = JSON.stringify(c.args);
              const half = Math.floor(json.length / 2);
              chunks.push({ model: 'gpt-test', choices: [{ index: 0, delta: { tool_calls: [{ index, id: c.id, function: { name: c.name, arguments: json.slice(0, half) } }] } }] });
              chunks.push({ model: 'gpt-test', choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: json.slice(half) } }] } }] });
            });
            chunks.push({ model: 'gpt-test', choices: [{ index: 0, delta: {}, finish_reason: { end: 'stop', tool_calls: 'tool_calls', max_tokens: 'length' }[s.stop] }] });
            chunks.push({
              model: 'gpt-test',
              choices: [],
              usage: { prompt_tokens: s.usage.input + s.usage.cached, completion_tokens: s.usage.output, prompt_tokens_details: { cached_tokens: s.usage.cached } },
            });
            return { async *[Symbol.asyncIterator]() { yield* chunks; } };
          }) as unknown as OpenAILike['chat']['completions']['create'],
        },
      },
    };
    return { provider: new OpenAIAdapter({ client }), sent: () => params };
  },
};

const request: LLMRequest = {
  model: 'test-model',
  system: 'Sei il copilota di Padana Logistics.',
  messages: [{ role: 'user', content: 'Ciao' }],
  tools: [{ name: 'cerca_knowledge_base', description: 'Cerca nei documenti', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
};

async function run(provider: LLMProvider) {
  const deltas: string[] = [];
  let done: Extract<LLMStreamEvent, { type: 'done' }>['result'] | undefined;
  for await (const e of provider.chatStream(request)) {
    if (e.type === 'text_delta') deltas.push(e.text);
    else done = e.result;
  }
  return { deltas, result: done! };
}

describe.each([anthropicHarness, openaiHarness])('conformità adapter: $name', (h) => {
  it('risposta di solo testo', async () => {
    const { provider } = h.make({ text: 'Ciao Sara, come posso aiutarti?', toolCalls: [], stop: 'end', usage: { input: 90, cached: 10, output: 7 } });
    const { deltas, result } = await run(provider);
    expect(result.text).toBe('Ciao Sara, come posso aiutarti?');
    expect(deltas.join('')).toBe(result.text);
    expect(deltas.length).toBeGreaterThan(1);
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe('end');
    expect(result.usage).toEqual({ inputTokens: 90, cachedInputTokens: 10, outputTokens: 7 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('una chiamata a tool', async () => {
    const call = { id: 'call_1', name: 'cerca_knowledge_base', args: { query: 'SLA ModaNova', cliente: 'ModaNova' } };
    const { provider } = h.make({ text: '', toolCalls: [call], stop: 'tool_calls', usage: { input: 50, cached: 0, output: 12 } });
    const { result } = await run(provider);
    expect(result.toolCalls).toEqual([call]);
    expect(result.stopReason).toBe('tool_calls');
  });

  it('due chiamate parallele nell’ordine originale', async () => {
    const calls = [
      { id: 'a', name: 'cerca_knowledge_base', args: { query: 'soglia danni' } },
      { id: 'b', name: 'analizza_dati', args: { domanda: 'tasso danni per vettore', genera_grafico: true } },
    ];
    const { provider } = h.make({ text: '', toolCalls: calls, stop: 'tool_calls', usage: { input: 50, cached: 0, output: 30 } });
    expect((await run(provider)).result.toolCalls).toEqual(calls);
  });

  it('chat() restituisce lo stesso risultato dello stream', async () => {
    const { provider } = h.make({ text: 'ok', toolCalls: [], stop: 'max_tokens', usage: { input: 1, cached: 0, output: 1 } });
    const result = await provider.chat(request);
    expect(result.text).toBe('ok');
    expect(result.stopReason).toBe('max_tokens');
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
  ])('errore HTTP %i -> LLMError (retryable=%s)', async (status, retryable) => {
    const { provider } = h.make({ error: status });
    const err = await provider.chat(request).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.retryable).toBe(retryable);
    expect(err.provider).toBe(h.name);
  });
});

describe('traduzione richieste: anthropic', () => {
  const conversation: LLMRequest = {
    ...request,
    messages: [
      { role: 'user', content: 'Penale ModaNova?' },
      { role: 'assistant', content: 'Controllo.', toolCalls: [{ id: 't1', name: 'cerca_knowledge_base', args: { query: 'SLA' } }, { id: 't2', name: 'analizza_dati', args: { domanda: 'x' } }] },
      { role: 'tool', toolCallId: 't1', name: 'cerca_knowledge_base', content: 'soglia 95%' },
      { role: 'tool', toolCallId: 't2', name: 'analizza_dati', content: 'boom', isError: true },
    ],
  };

  it('system separato, tool convertiti, nessuna temperature', async () => {
    const { provider, sent } = anthropicHarness.make({ text: 'ok', toolCalls: [], stop: 'end', usage: { input: 1, cached: 0, output: 1 } });
    await provider.chat(conversation);
    const p = sent() as Record<string, any>;
    expect(p.system).toBe(request.system);
    expect(p.tools[0]).toMatchObject({ name: 'cerca_knowledge_base', input_schema: { type: 'object' } });
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('tool_choice');
    expect(p.max_tokens).toBe(16000);
  });

  it('i tool_result consecutivi finiscono in un solo messaggio user', async () => {
    const { provider, sent } = anthropicHarness.make({ text: 'ok', toolCalls: [], stop: 'end', usage: { input: 1, cached: 0, output: 1 } });
    await provider.chat(conversation);
    const msgs = (sent() as any).messages;
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1].content.map((b: any) => b.type)).toEqual(['text', 'tool_use', 'tool_use']);
    expect(msgs[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'soglia 95%' },
      { type: 'tool_result', tool_use_id: 't2', content: 'boom', is_error: true },
    ]);
  });

  it('il contenuto grezzo del turno (providerState) viene rimandato invariato', async () => {
    const raw = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 't1', name: 'x', input: {} }];
    const { provider, sent } = anthropicHarness.make({ text: 'ok', toolCalls: [], stop: 'end', usage: { input: 1, cached: 0, output: 1 } });
    await provider.chat({ ...request, messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', providerState: { provider: 'anthropic', content: raw } }] });
    expect((sent() as any).messages[1].content).toEqual(raw);
  });

  it('il risultato espone providerState per il turno successivo', async () => {
    const { provider } = anthropicHarness.make({ text: 'ok', toolCalls: [], stop: 'end', usage: { input: 1, cached: 0, output: 1 } });
    const result = await provider.chat(request);
    expect(result.providerState).toMatchObject({ provider: 'anthropic' });
  });

  it('fallback server-side solo se abilitati', async () => {
    let params: any;
    const client = { beta: { messages: { stream: (p: any) => { params = p; throw new Anthropic.APIError(400, {}, 'x', new Headers()); } } } } as unknown as AnthropicLike;
    await new AnthropicAdapter({ client, serverFallbacks: true }).chat(request).catch(() => {});
    expect(params).toMatchObject({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  });
});

describe('traduzione richieste: openai', () => {
  it('system come primo messaggio, tool function, risultati separati', async () => {
    const { provider, sent } = openaiHarness.make({ text: 'ok', toolCalls: [], stop: 'end', usage: { input: 1, cached: 0, output: 1 } });
    await provider.chat({
      ...request,
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'cerca_knowledge_base', args: { query: 'SLA' } }] },
        { role: 'tool', toolCallId: 't1', name: 'cerca_knowledge_base', content: 'risultato' },
      ],
    });
    const p = sent() as Record<string, any>;
    expect(p.messages[0]).toEqual({ role: 'system', content: request.system });
    expect(p.messages[2]).toMatchObject({ role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'cerca_knowledge_base', arguments: '{"query":"SLA"}' } }] });
    expect(p.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'risultato' });
    expect(p.tools[0]).toMatchObject({ type: 'function', function: { name: 'cerca_knowledge_base' } });
    expect(p.stream_options).toEqual({ include_usage: true });
  });

  it('argomenti JSON malformati -> argsError invece di eccezione', async () => {
    const client: OpenAILike = {
      chat: { completions: { create: (async () => ({
        async *[Symbol.asyncIterator]() {
          yield { model: 'm', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'analizza_dati', arguments: '{"domanda": ' } }] } }] };
          yield { model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] };
        },
      })) as unknown as OpenAILike['chat']['completions']['create'] } },
    };
    const result = await new OpenAIAdapter({ client }).chat(request);
    expect(result.toolCalls[0]).toMatchObject({ name: 'analizza_dati', args: {}, argsError: 'argomenti JSON non validi' });
  });
});
