// Client HTTP del microservizio data agent (Python). Ogni richiesta porta un JWT di servizio
// firmato con il segreto condiviso, valido 60 secondi.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { artifactSchema, type Artifact } from '@logisticai/shared';
import { signServiceToken } from '../auth/tokens.js';

export interface AnalyzeInput {
  domanda: string;
  genera_grafico: boolean;
  regole_da_applicare?: string;
}

export interface DataAgentUsage {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface AnalyzeOutput {
  sintesi: string;
  artifacts: Artifact[];
  artifacts_riepilogo: string[];
  codice_eseguito: string[];
  pulizia: string[];
  righe_analizzate: number;
  usage: DataAgentUsage[];
  /** Artifact scartati perché non conformi allo schema condiviso. */
  scartati: number;
}

const responseSchema = z.object({
  sintesi: z.string(),
  artifacts: z.array(z.unknown()),
  artifacts_riepilogo: z.array(z.string()).default([]),
  codice_eseguito: z.array(z.string()).default([]),
  pulizia: z.array(z.string()).default([]),
  righe_analizzate: z.number(),
  usage: z
    .array(z.object({ provider: z.string(), model: z.string(), input_tokens: z.number(), output_tokens: z.number(), latency_ms: z.number() }))
    .default([]),
});

export class DataAgentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DataAgentError';
  }
}

export interface DataAgentClientOptions {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class DataAgentClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DataAgentClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async headers(userId: string, requestId: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await signServiceToken(userId, requestId, this.options.secret)}`,
    };
  }

  async analyze(input: AnalyzeInput, ctx: { userId: string; requestId?: string; signal?: AbortSignal }): Promise<AnalyzeOutput> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 120_000);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.options.baseUrl}/analyze`, {
        method: 'POST',
        headers: await this.headers(ctx.userId, ctx.requestId ?? randomUUID()),
        body: JSON.stringify(input),
        signal,
      });
    } catch (err) {
      if (timeout.aborted) throw new DataAgentError("L'analisi dei dati ha superato il tempo massimo");
      if (ctx.signal?.aborted) throw err;
      throw new DataAgentError('Il servizio di analisi dati non è raggiungibile');
    }
    if (!res.ok) {
      const detail = await res.json().then(
        (b: { detail?: unknown }) => b.detail,
        () => undefined,
      );
      const message =
        res.status === 504
          ? "L'analisi dei dati ha superato il tempo massimo"
          : res.status === 401
            ? 'Autenticazione verso il servizio di analisi dati non valida'
            : `Analisi dei dati non riuscita${typeof detail === 'string' ? `: ${detail}` : ''}`;
      throw new DataAgentError(message, res.status);
    }
    const body = responseSchema.parse(await res.json());
    const artifacts: Artifact[] = [];
    for (const raw of body.artifacts) {
      const parsed = artifactSchema.safeParse(raw);
      if (parsed.success) artifacts.push(parsed.data);
    }
    return { ...body, artifacts, scartati: body.artifacts.length - artifacts.length };
  }

  async healthy(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async dataQuality(userId: string): Promise<unknown> {
    const res = await this.fetchImpl(`${this.options.baseUrl}/data-quality`, { headers: await this.headers(userId, randomUUID()) });
    if (!res.ok) throw new DataAgentError('Report di qualità dei dati non disponibile', res.status);
    return res.json();
  }
}
