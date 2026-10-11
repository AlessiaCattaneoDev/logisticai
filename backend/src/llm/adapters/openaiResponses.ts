// Adapter OpenAI basato sulla Responses API: è l'unica API OpenAI che combina ragionamento e
// strumenti (Chat Completions disattiva il ragionamento quando ci sono tool). Stateless:
// store=false e ragionamento cifrato rimandato nello stesso turno tramite providerState.
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
  type ToolDefinition,
} from '../types.js';

type InputItem = OpenAI.Responses.ResponseInputItem;

export interface OpenAIResponsesLike {
  responses: { create: OpenAI['responses']['create'] };
}

interface ResponsesState {
  provider: 'openai-responses';
  output: unknown[];
}

export function toResponsesInput(messages: NeutralMessage[]): InputItem[] {
  const out: InputItem[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const state = m.providerState as ResponsesState | undefined;
      if (state?.provider === 'openai-responses') {
        out.push(...(state.output as InputItem[]));
        continue;
      }
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls ?? []) {
        out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) });
      }
    } else {
      out.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.isError ? `ERRORE: ${m.content}` : m.content });
    }
  }
  return out;
}

export function toResponsesTools(tools: ToolDefinition[]): OpenAI.Responses.FunctionTool[] {
  return tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: { ...t.parameters }, strict: false }));
}

export class OpenAIResponsesAdapter implements LLMProvider {
  readonly id = 'openai' as const;
  private readonly client: OpenAIResponsesLike;

  constructor(private readonly options: { client?: OpenAIResponsesLike; apiKey?: string; baseURL?: string; defaultMaxOutputTokens?: number } = {}) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  async *chatStream(req: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const started = performance.now();
    try {
      const stream = await this.client.responses.create(
        {
          model: req.model,
          instructions: req.system,
          input: toResponsesInput(req.messages),
          ...(req.tools?.length ? { tools: toResponsesTools(req.tools) } : {}),
          max_output_tokens: req.maxOutputTokens ?? this.options.defaultMaxOutputTokens ?? 16000,
          store: false,
          ...(req.reasoningEffort ? { reasoning: { effort: req.reasoningEffort }, include: ['reasoning.encrypted_content'] } : {}),
          stream: true,
        },
        { signal: req.signal },
      );
      let response: OpenAI.Responses.Response | undefined;
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') yield { type: 'text_delta', text: event.delta };
        else if (event.type === 'response.completed' || event.type === 'response.incomplete') response = event.response;
        else if (event.type === 'response.failed') throw new LLMError(event.response.error?.message ?? 'Risposta non riuscita', 'openai', true);
        else if (event.type === 'error') throw new LLMError(event.message, 'openai', true);
      }
      if (!response) throw new LLMError('Stream terminato senza risposta', 'openai', true);

      const text = response.output
        .filter((o): o is OpenAI.Responses.ResponseOutputMessage => o.type === 'message')
        .flatMap((o) => o.content)
        .map((c) => (c.type === 'output_text' ? c.text : ''))
        .join('');
      const toolCalls = response.output
        .filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call')
        .map((o) => ({ id: o.call_id, name: o.name, ...parseToolArgs(o.arguments) }));
      const reason = response.incomplete_details?.reason;
      const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
      const result: LLMResult = {
        text,
        toolCalls,
        usage: {
          inputTokens: (response.usage?.input_tokens ?? 0) - cached,
          outputTokens: response.usage?.output_tokens ?? 0,
          cachedInputTokens: cached,
        },
        stopReason: toolCalls.length ? 'tool_calls' : reason === 'max_output_tokens' ? 'max_tokens' : reason === 'content_filter' ? 'refusal' : 'end',
        model: response.model,
        latencyMs: Math.round(performance.now() - started),
        providerState: { provider: 'openai-responses', output: response.output } satisfies ResponsesState,
      };
      yield { type: 'done', result };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status;
        throw new LLMError(err.message, 'openai', status === undefined || status === 429 || status >= 500);
      }
      throw err;
    }
  }

  chat(req: LLMRequest): Promise<LLMResult> {
    return collectStream(this.chatStream(req));
  }
}
