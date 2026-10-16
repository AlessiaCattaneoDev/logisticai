import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

const validEnv = {
  JWT_SECRET: 'x'.repeat(32),
  INTERNAL_SERVICE_SECRET: 'y'.repeat(32),
  DATABASE_URL: 'file:./test.db',
  LLM_PROVIDER: 'openai',
  LLM_MODEL: 'some-model',
  OPENAI_API_KEY: 'sk-test',
  EMBEDDING_PROVIDER: 'openai',
  EMBEDDING_MODEL: 'some-embedding',
};

describe('loadConfig', () => {
  it('applica i valori di default', () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3001);
    expect(config.frontendOrigin).toBe('http://localhost:5173');
    expect(config.jwt.expiresIn).toBe('8h');
    expect(config.costs.usdEurRate).toBe(0.92);
    expect(config.dataAgentUrl).toBe('http://127.0.0.1:8001');
  });

  it('converte i numeri dalle stringhe', () => {
    const config = loadConfig({ ...validEnv, BACKEND_PORT: '4000', DAILY_BUDGET_EUR: '12.5' });
    expect(config.port).toBe(4000);
    expect(config.costs.dailyBudgetEur).toBe(12.5);
  });

  it('rifiuta segreti JWT troppo corti', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'corto' })).toThrow(ConfigError);
  });

  it('richiede la chiave del provider LLM scelto', () => {
    const { OPENAI_API_KEY: _omit, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow(/OPENAI_API_KEY/);
  });

  it('accetta un provider diverso con la sua chiave', () => {
    const config = loadConfig({
      ...validEnv,
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    expect(config.llm.provider).toBe('anthropic');
  });

  it('rifiuta un provider sconosciuto', () => {
    expect(() => loadConfig({ ...validEnv, LLM_PROVIDER: 'skynet' })).toThrow(ConfigError);
  });

  it('elenca tutti i problemi in un unico messaggio', () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as Error).message;
      expect(message).toMatch(/JWT_SECRET/);
      expect(message).toMatch(/INTERNAL_SERVICE_SECRET/);
      expect(message).toMatch(/LLM_MODEL/);
    }
  });

  it('tratta le stringhe vuote come valori mancanti', () => {
    expect(() => loadConfig({ ...validEnv, LLM_MODEL: '' })).toThrow(/LLM_MODEL/);
  });
});
