import type { EmbeddingProvider, EmbeddingResult } from '../../src/llm/types';

/** Embedding deterministico "bag of words" con hashing: simile per testi che condividono parole. */
export class FakeEmbedder implements EmbeddingProvider {
  readonly id = 'fake' as const;
  calls = 0;

  constructor(readonly model = 'fake-embedding', private readonly dims = 512) {}

  vector(text: string): number[] {
    const v = new Array(this.dims).fill(0);
    const words = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) ?? [];
    for (const w of words) {
      let h = 2166136261;
      for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      v[Math.abs(h) % this.dims] += 1;
    }
    return v;
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    this.calls++;
    return { vectors: texts.map((t) => this.vector(t)), usage: { inputTokens: texts.join(' ').length / 4 }, latencyMs: 1 };
  }
}
