// Provider finto e deterministico: usato dai test (e utilizzabile per demo offline).
import {
  collectStream,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
  type LLMStreamEvent,
  type ToolCallRequest,
} from './types.js';

export type FakeTurn =
  | { text: string; toolCalls?: undefined }
  | { text?: string; toolCalls: Omit<ToolCallRequest, 'id'>[] }
  | { error: Error };

export class FakeLLMProvider implements LLMProvider {
  readonly id = 'fake' as const;
  readonly requests: LLMRequest[] = [];
  private turn = 0;

  constructor(private readonly script: FakeTurn[]) {}

  async *chatStream(req: LLMRequest): AsyncIterable<LLMStreamEvent> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const step = this.script[this.turn++];
    if (!step) throw new Error(`FakeLLMProvider: nessuna risposta prevista per la chiamata ${this.turn}`);
    if ('error' in step) throw step.error;
    const text = step.text ?? '';
    for (const word of text.split(/(?<= )/)) {
      if (word) yield { type: 'text_delta', text: word };
    }
    const toolCalls = (step.toolCalls ?? []).map((c, i) => ({ ...c, id: `call_${this.turn}_${i}` }));
    const result: LLMResult = {
      text,
      toolCalls,
      usage: { inputTokens: 100 * this.turn, outputTokens: 20, cachedInputTokens: 0 },
      stopReason: toolCalls.length ? 'tool_calls' : 'end',
      model: req.model,
      latencyMs: 5,
    };
    yield { type: 'done', result };
  }

  chat(req: LLMRequest): Promise<LLMResult> {
    return collectStream(this.chatStream(req));
  }

  get callCount(): number {
    return this.turn;
  }
}
