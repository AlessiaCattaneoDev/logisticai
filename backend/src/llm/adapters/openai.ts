// Adapter OpenAI Chat Completions. Funziona anche con endpoint compatibili (Ollama, vLLM, gateway)
// tramite baseURL. Unico file del backend che importa l'SDK openai.
import OpenAI from 'openai';
import {
  collectStream,
  LLMError,
  parseToolArgs,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamEvent,
  type NeutralMessage,
  type ProviderId,
  type StopReason,
  type ToolDefinition,
} from '../types.js';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAILike {
  chat: { completions: { create: OpenAI['chat']['completions']['create'] } };
}

export interface OpenAIAdapterOptions {
  client?: OpenAILike;
  apiKey?: string;
  baseURL?: string;
  /** 'local' quando punta a un modello on-premise (Ollama, vLLM). */
  id?: Extract<ProviderId, 'openai' | 'local'>;
  defaultMaxOutputTokens?: number;
}

const STOP: Record<string, StopReason> = {
  stop: 'end',
  tool_calls: 'tool_calls',
  length: 'max_tokens',
  content_filter: 'refusal',
};

export function toOpenAIMessages(system: string, messages: NeutralMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.isError ? `ERRORE: ${m.content}` : m.content });
    }
  }
  return out;
}

export function toOpenAITools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: { ...t.parameters } } }));
}

export class OpenAIAdapter implements LLMProvider {
  readonly id: Extract<ProviderId, 'openai' | 'local'>;
  private readonly client: OpenAILike;

  constructor(private readonly options: OpenAIAdapterOptions = {}) {
    this.id = options.id ?? 'openai';
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey ?? 'not-needed', baseURL: options.baseURL });
  }

  async *chatStream(req: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const started = performance.now();
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: req.model,
          messages: toOpenAIMessages(req.system, req.messages),
          ...(req.tools?.length ? { tools: toOpenAITools(req.tools) } : {}),
          max_completion_tokens: req.maxOutputTokens ?? this.options.defaultMaxOutputTokens ?? 16000,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: req.signal },
      );
      let text = '';
      let model = req.model;
      let finish: string | null = null;
      let usage: OpenAI.CompletionUsage | undefined;
      const calls = new Map<number, { id: string; name: string; args: string }>();
      for await (const chunk of stream) {
        model = chunk.model || model;
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices[0];
        if (!choice) continue;
        if (choice.delta?.content) {
          text += choice.delta.content;
          yield { type: 'text_delta', text: choice.delta.content };
        }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const entry = calls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
          calls.set(tc.index, entry);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
      const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const result: LLMResult = {
        text,
        toolCalls: [...calls.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, c]) => ({ id: c.id, name: c.name, ...parseToolArgs(c.args) })),
        usage: {
          inputTokens: (usage?.prompt_tokens ?? 0) - cached,
          outputTokens: usage?.completion_tokens ?? 0,
          cachedInputTokens: cached,
        },
        stopReason: STOP[finish ?? ''] ?? 'other',
        model,
        latencyMs: Math.round(performance.now() - started),
      };
      yield { type: 'done', result };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status;
        throw new LLMError(err.message, this.id, status === undefined || status === 429 || status >= 500);
      }
      throw err;
    }
  }

  chat(req: LLMRequest): Promise<LLMResult> {
    return collectStream(this.chatStream(req));
  }
}
