import { describe, expect, it } from 'vitest';
import { parseSse } from './sse';

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
}

async function collect(chunks: string[]) {
  const out = [];
  for await (const m of parseSse(streamOf(chunks))) out.push(m);
  return out;
}

describe('parseSse', () => {
  it('eventi completi in un solo chunk', async () => {
    expect(await collect(['event: status\ndata: {"stage":"thinking"}\n\nevent: delta\ndata: {"text":"Ciao"}\n\n'])).toEqual([
      { event: 'status', data: { stage: 'thinking' } },
      { event: 'delta', data: { text: 'Ciao' } },
    ]);
  });

  it('eventi spezzati tra più chunk, anche a metà carattere multibyte', async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode('event: delta\ndata: {"text":"Puntualità"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // spezza "à"
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const out = [];
    for await (const m of parseSse(stream)) out.push(m);
    expect(out).toEqual([{ event: 'delta', data: { text: 'Puntualità' } }]);
  });

  it('ultimo evento senza riga vuota finale e blocchi non validi ignorati', async () => {
    expect(await collect(['event: x\ndata: non-json\n\n', 'event: done\ndata: {"ok":true}'])).toEqual([{ event: 'done', data: { ok: true } }]);
  });
});
