import OpenAI from 'openai';
import { LLMError, type EmbeddingProvider, type EmbeddingResult } from '../types.js';

export interface OpenAIEmbeddingsLike {
  embeddings: { create: OpenAI['embeddings']['create'] };
}

export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly id = 'openai' as const;
  private readonly client: OpenAIEmbeddingsLike;

  constructor(
    readonly model: string,
    options: { apiKey?: string; baseURL?: string; client?: OpenAIEmbeddingsLike } = {},
  ) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const started = performance.now();
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: texts });
      const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      return { vectors, usage: { inputTokens: res.usage.prompt_tokens }, latencyMs: Math.round(performance.now() - started) };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status;
        throw new LLMError(err.message, 'openai', status === undefined || status === 429 || status >= 500);
      }
      throw err;
    }
  }
}
