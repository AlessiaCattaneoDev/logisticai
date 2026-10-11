// Adapter Claude (Anthropic Messages API). Unico file del backend che importa @anthropic-ai/sdk.
import Anthropic from '@anthropic-ai/sdk';
import {
  collectStream,
  LLMError,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamEvent,
  type NeutralMessage,
  type StopReason,
  type ToolDefinition,
} from '../types.js';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

/** Sottoinsieme del client usato: permette di iniettare uno stub nei test. */
export interface AnthropicLike {
  beta: { messages: { stream: Anthropic['beta']['messages']['stream'] } };
}

export interface AnthropicAdapterOptions {
  client?: AnthropicLike;
  apiKey?: string;
  /** Fallback server-side in caso di rifiuto (solo API Anthropic diretta, non Bedrock/Vertex). */
  serverFallbacks?: boolean;
  defaultMaxOutputTokens?: number;
}

interface AnthropicState {
  provider: 'anthropic';
  content: unknown[];
}

const STOP: Record<string, StopReason> = {
  end_turn: 'end',
  tool_use: 'tool_calls',
  max_tokens: 'max_tokens',
  refusal: 'refusal',
};

export function toAnthropicMessages(messages: NeutralMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const state = m.providerState as AnthropicState | undefined;
      if (state?.provider === 'anthropic') {
        // Stesso turno: contenuto rimandato invariato (necessario per i blocchi thinking).
        out.push({ role: 'assistant', content: state.content as ContentBlockParam[] });
        continue;
      }
      const content: ContentBlockParam[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      out.push({ role: 'assistant', content });
    } else {
      // Tutti i tool_result consecutivi vanno in UN solo messaggio user (chiamate parallele).
      const block: ContentBlockParam = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      };
      const last = out.at(-1);
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: { ...t.parameters } }));
}

export class AnthropicAdapter implements LLMProvider {
  readonly id = 'anthropic' as const;
  private readonly client: AnthropicLike;

  constructor(private readonly options: AnthropicAdapterOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  async *chatStream(req: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const started = performance.now();
    try {
      // Niente temperature né tool_choice forzato: sui modelli Claude attuali danno 400.
      const stream = this.client.beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens ?? this.options.defaultMaxOutputTokens ?? 16000,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          ...(req.tools?.length ? { tools: toAnthropicTools(req.tools) } : {}),
          ...(req.reasoningEffort ? { output_config: { effort: req.reasoningEffort } } : {}),
          ...(this.options.serverFallbacks
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        }
      }
      const message = await stream.finalMessage();
      const result: LLMResult = {
        text: message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join(''),
        toolCalls: message.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> })),
        usage: {
          inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
          outputTokens: message.usage.output_tokens,
          cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
        },
        stopReason: STOP[message.stop_reason ?? ''] ?? 'other',
        model: message.model,
        latencyMs: Math.round(performance.now() - started),
        providerState: { provider: 'anthropic', content: message.content } satisfies AnthropicState,
      };
      yield { type: 'done', result };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const status = err.status;
        throw new LLMError(err.message, 'anthropic', status === undefined || status === 429 || status >= 500);
      }
      throw err;
    }
  }

  chat(req: LLMRequest): Promise<LLMResult> {
    return collectStream(this.chatStream(req));
  }
}
