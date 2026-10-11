import type { AppConfig } from '../config.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { OpenAIEmbeddingAdapter } from './adapters/openaiEmbeddings.js';
import { OpenAIResponsesAdapter } from './adapters/openaiResponses.js';
import type { EmbeddingProvider, LLMProvider } from './types.js';

/** Sceglie l'adapter in base al .env: cambiare provider = cambiare LLM_PROVIDER / LLM_MODEL. */
export function createLLMProvider(config: Pick<AppConfig, 'llm' | 'credentials'>): LLMProvider {
  const { provider, baseUrl } = config.llm;
  switch (provider) {
    case 'openai':
      // Responses API: unica API OpenAI che combina ragionamento e strumenti.
      return new OpenAIResponsesAdapter({ apiKey: config.credentials.OPENAI_API_KEY, baseURL: baseUrl });
    case 'local':
      return new OpenAIAdapter({ id: 'local', baseURL: baseUrl });
    case 'anthropic':
      // I fallback server-side esistono solo sull'API Anthropic diretta (non con endpoint personalizzati).
      return new AnthropicAdapter({ apiKey: config.credentials.ANTHROPIC_API_KEY, serverFallbacks: !baseUrl });
    default:
      throw new Error(`Adapter LLM "${provider}" non ancora implementato: vedi PROGETTO.md §9 per aggiungerlo`);
  }
}

/** Embedding per la RAG. Anthropic non offre embedding: si usa OpenAI (o un endpoint compatibile). */
export function createEmbeddingProvider(config: Pick<AppConfig, 'embedding' | 'credentials' | 'llm'>): EmbeddingProvider {
  const { provider, model } = config.embedding;
  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddingAdapter(model, { apiKey: config.credentials.OPENAI_API_KEY });
    case 'local':
      return new OpenAIEmbeddingAdapter(model, { baseURL: config.llm.baseUrl, apiKey: 'not-needed' });
    default:
      throw new Error(`Provider di embedding "${provider}" non ancora implementato: vedi PROGETTO.md §9`);
  }
}
