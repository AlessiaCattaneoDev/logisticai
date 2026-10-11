import { describe, expect, it } from 'vitest';
import { AnthropicAdapter } from '../adapters/anthropic';
import { OpenAIAdapter } from '../adapters/openai';
import { createLLMProvider } from '../factory';

const credentials = { OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-test' };

describe('createLLMProvider', () => {
  it.each([
    ['openai', OpenAIAdapter, 'openai'],
    ['anthropic', AnthropicAdapter, 'anthropic'],
    ['local', OpenAIAdapter, 'local'],
  ] as const)('%s', (provider, cls, id) => {
    const p = createLLMProvider({ llm: { provider, model: 'm', baseUrl: provider === 'local' ? 'http://localhost:11434/v1' : undefined }, credentials });
    expect(p).toBeInstanceOf(cls);
    expect(p.id).toBe(id);
  });

  it('provider non ancora implementato: errore esplicito', () => {
    expect(() => createLLMProvider({ llm: { provider: 'mistral', model: 'm' }, credentials })).toThrow(/non ancora implementato/);
  });
});
