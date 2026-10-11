import type { AppConfig } from '../config.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { OpenAIAdapter } from './adapters/openai.js';
import type { LLMProvider } from './types.js';

/** Sceglie l'adapter in base al .env: cambiare provider = cambiare LLM_PROVIDER / LLM_MODEL. */
export function createLLMProvider(config: Pick<AppConfig, 'llm' | 'credentials'>): LLMProvider {
  const { provider, baseUrl } = config.llm;
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter({ apiKey: config.credentials.OPENAI_API_KEY, baseURL: baseUrl });
    case 'local':
      return new OpenAIAdapter({ id: 'local', baseURL: baseUrl });
    case 'anthropic':
      // I fallback server-side esistono solo sull'API Anthropic diretta (non con endpoint personalizzati).
      return new AnthropicAdapter({ apiKey: config.credentials.ANTHROPIC_API_KEY, serverFallbacks: !baseUrl });
    default:
      throw new Error(`Adapter LLM "${provider}" non ancora implementato: vedi PROGETTO.md §9 per aggiungerlo`);
  }
}
