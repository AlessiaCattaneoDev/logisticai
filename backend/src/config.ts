import { z } from 'zod';

export const LLM_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'local'] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

// Variabile che deve essere valorizzata per poter usare ciascun provider.
const PROVIDER_CREDENTIAL: Record<LlmProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_CLOUD_PROJECT',
  mistral: 'MISTRAL_API_KEY',
  local: 'LLM_BASE_URL',
};

export class ConfigError extends Error {
  constructor(issues: string[]) {
    super(`Configurazione non valida (.env):\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

// Le stringhe vuote del .env equivalgono a valori mancanti.
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const requiredString = z.preprocess((v) => (v === '' ? undefined : v), z.string({ error: 'obbligatoria' }));
const secret = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string({ error: 'obbligatoria' }).min(32, 'deve avere almeno 32 caratteri'),
);
const provider = z.enum(LLM_PROVIDERS);

const envSchema = z
  .object({
    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: z.string().default('8h'),
    INTERNAL_SERVICE_SECRET: secret,
    DATABASE_URL: requiredString,
    LLM_PROVIDER: provider.default('openai'),
    LLM_MODEL: requiredString,
    LLM_REGION: optionalString,
    LLM_BASE_URL: optionalString,
    EMBEDDING_PROVIDER: provider.default('openai'),
    EMBEDDING_MODEL: requiredString,
    OPENAI_API_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    GOOGLE_CLOUD_PROJECT: optionalString,
    MISTRAL_API_KEY: optionalString,
    USD_EUR_RATE: z.coerce.number().positive().default(0.92),
    DAILY_BUDGET_EUR: z.coerce.number().nonnegative().default(5),
    MONTHLY_BUDGET_EUR: z.coerce.number().nonnegative().default(50),
    CHAT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
    DATA_AGENT_URL: z.string().default('http://127.0.0.1:8001'),
    CHROMA_URL: z.string().default('http://127.0.0.1:8000'),
    CHROMA_COLLECTION: z.string().default('kb_padana'),
  })
  .superRefine((env, ctx) => {
    for (const field of ['LLM_PROVIDER', 'EMBEDDING_PROVIDER'] as const) {
      const credential = PROVIDER_CREDENTIAL[env[field]];
      if (!env[credential as keyof typeof env]) {
        ctx.addIssue({
          code: 'custom',
          path: [credential],
          message: `obbligatoria con ${field}=${env[field]}`,
        });
      }
    }
  });

export interface AppConfig {
  port: number;
  frontendOrigin: string;
  databaseUrl: string;
  jwt: { secret: string; expiresIn: string };
  internalServiceSecret: string;
  llm: { provider: LlmProviderId; model: string; region?: string; baseUrl?: string };
  embedding: { provider: LlmProviderId; model: string };
  credentials: Partial<Record<string, string>>;
  costs: { usdEurRate: number; dailyBudgetEur: number; monthlyBudgetEur: number };
  chatRetentionDays: number;
  dataAgentUrl: string;
  chroma: { url: string; collection: string };
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = parsed.data;
  return {
    port: e.BACKEND_PORT,
    frontendOrigin: e.FRONTEND_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
    internalServiceSecret: e.INTERNAL_SERVICE_SECRET,
    llm: { provider: e.LLM_PROVIDER, model: e.LLM_MODEL, region: e.LLM_REGION, baseUrl: e.LLM_BASE_URL },
    embedding: { provider: e.EMBEDDING_PROVIDER, model: e.EMBEDDING_MODEL },
    credentials: {
      OPENAI_API_KEY: e.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY,
      GOOGLE_CLOUD_PROJECT: e.GOOGLE_CLOUD_PROJECT,
      MISTRAL_API_KEY: e.MISTRAL_API_KEY,
    },
    costs: {
      usdEurRate: e.USD_EUR_RATE,
      dailyBudgetEur: e.DAILY_BUDGET_EUR,
      monthlyBudgetEur: e.MONTHLY_BUDGET_EUR,
    },
    chatRetentionDays: e.CHAT_RETENTION_DAYS,
    dataAgentUrl: e.DATA_AGENT_URL,
    chroma: { url: e.CHROMA_URL, collection: e.CHROMA_COLLECTION },
  };
}
