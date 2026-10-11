// Formato neutro, indipendente da qualsiasi provider. Il resto del backend usa SOLO questi tipi:
// gli SDK dei provider compaiono esclusivamente in src/llm/adapters/.

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'mistral' | 'local' | 'fake';

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Valorizzato se il modello ha prodotto argomenti non parsabili: va restituito come errore al modello. */
  argsError?: string;
}

export type NeutralMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCallRequest[];
      /** Contenuto grezzo del provider, da rimandare invariato nello stesso turno (es. blocchi thinking). */
      providerState?: unknown;
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface LLMRequest {
  model: string;
  system: string;
  messages: NeutralMessage[];
  tools?: ToolDefinition[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

/** inputTokens = token di input NON in cache; cachedInputTokens = letti dalla cache (prezzo ridotto). */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export type StopReason = 'end' | 'tool_calls' | 'max_tokens' | 'refusal' | 'other';

export interface LLMResult {
  text: string;
  toolCalls: ToolCallRequest[];
  usage: LLMUsage;
  stopReason: StopReason;
  model: string;
  latencyMs: number;
  providerState?: unknown;
}

export type LLMStreamEvent = { type: 'text_delta'; text: string } | { type: 'done'; result: LLMResult };

export interface LLMProvider {
  readonly id: ProviderId;
  chatStream(req: LLMRequest): AsyncIterable<LLMStreamEvent>;
  chat(req: LLMRequest): Promise<LLMResult>;
}

export interface EmbeddingResult {
  vectors: number[][];
  usage: { inputTokens: number };
  latencyMs: number;
}

export interface EmbeddingProvider {
  readonly id: ProviderId;
  readonly model: string;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Implementazione di chat() comune: consuma lo stream e restituisce il risultato finale. */
export async function collectStream(stream: AsyncIterable<LLMStreamEvent>): Promise<LLMResult> {
  for await (const event of stream) {
    if (event.type === 'done') return event.result;
  }
  throw new Error('Stream terminato senza risultato');
}

export function parseToolArgs(raw: string | undefined): Pick<ToolCallRequest, 'args' | 'argsError'> {
  if (!raw || !raw.trim()) return { args: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { args: parsed };
    return { args: {}, argsError: 'gli argomenti non sono un oggetto JSON' };
  } catch {
    return { args: {}, argsError: 'argomenti JSON non validi' };
  }
}
