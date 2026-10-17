import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { DataAgentClient, DataAgentError } from '../src/services/dataAgentClient';

const SECRET = 'd'.repeat(40);
const chart = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/contracts/fixtures/valid/chart_line_sla.json'), 'utf8'));
const invalid = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/contracts/fixtures/invalid/chart_missing_xkey.json'), 'utf8'));

const okBody = {
  sintesi: 'ok', artifacts: [chart, invalid], artifacts_riepilogo: ['grafico line'], codice_eseguito: ['print(1)'],
  pulizia: ['Rimosse 240 righe duplicate'], righe_analizzate: 11987,
  usage: [{ provider: 'openai', model: 'm', input_tokens: 10, output_tokens: 5, latency_ms: 100 }],
};

function client(response: () => Response | Promise<Response>, calls: { url: string; init: RequestInit }[] = []) {
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as unknown as typeof fetch;
  return new DataAgentClient({ baseUrl: 'http://127.0.0.1:8001', secret: SECRET, fetchImpl });
}

describe('DataAgentClient.analyze', () => {
  it('invia un JWT di servizio valido e il corpo della richiesta', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await client(() => Response.json(okBody), calls).analyze({ domanda: 'q', genera_grafico: true, regole_da_applicare: 'soglia 95%' }, { userId: 'u1', requestId: 'r1' });
    expect(calls[0].url).toBe('http://127.0.0.1:8001/analyze');
    const token = (calls[0].init.headers as Record<string, string>).Authorization.replace('Bearer ', '');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { audience: 'data-agent', issuer: 'logisticai-backend' });
    expect(payload).toMatchObject({ sub: 'u1', jti: 'r1' });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ domanda: 'q', genera_grafico: true, regole_da_applicare: 'soglia 95%' });
  });

  it('valida gli artifact con lo schema condiviso e scarta quelli non conformi', async () => {
    const out = await client(() => Response.json(okBody)).analyze({ domanda: 'q', genera_grafico: true }, { userId: 'u' });
    expect(out.artifacts).toHaveLength(1);
    expect(out.artifacts[0].kind).toBe('chart');
    expect(out.scartati).toBe(1);
    expect(out.usage[0].input_tokens).toBe(10);
  });

  it.each([
    [504, /tempo massimo/],
    [502, /non riuscita: modello giù/],
    [401, /Autenticazione/],
  ])('HTTP %i -> DataAgentError leggibile', async (status, message) => {
    const err = await client(() => Response.json({ detail: 'modello giù' }, { status })).analyze({ domanda: 'q', genera_grafico: false }, { userId: 'u' }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(DataAgentError);
    expect((err as Error).message).toMatch(message);
  });

  it('servizio spento -> messaggio "non raggiungibile"', async () => {
    const err = await client(() => { throw new TypeError('fetch failed'); }).analyze({ domanda: 'q', genera_grafico: false }, { userId: 'u' }).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/non è raggiungibile/);
  });
});

describe('DataAgentClient.healthy', () => {
  it('true se /health risponde 200, false se irraggiungibile', async () => {
    expect(await client(() => Response.json({ status: 'ok' })).healthy()).toBe(true);
    expect(await client(() => { throw new Error('down'); }).healthy()).toBe(false);
  });
});

// data_agent/CLAUDE.md è un file di lavoro locale (ignorato da git): senza, il controllo si salta.
const DOC = resolve(import.meta.dirname, '../../data_agent/CLAUDE.md');
describe.skipIf(!existsSync(DOC))('contratto con il data agent reale', () => {
  it('la risposta d’esempio rispetta il formato documentato in data_agent/CLAUDE.md', () => {
    const doc = readFileSync(DOC, 'utf8');
    for (const key of Object.keys(okBody)) expect(doc).toContain(key);
  });
});
