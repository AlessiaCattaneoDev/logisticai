import type { ChatStreamEvent, FeedbackRating, StoredMessage, ToolName } from '@logisticai/shared';

export interface Step {
  tool: ToolName;
  status: 'running' | 'ok' | 'error';
  durationMs?: number;
}

export interface UiMessage extends StoredMessage {
  steps?: Step[];
  streaming?: boolean;
  retryable?: boolean;
  /** Risposta interrotta dall'utente con "Interrompi". */
  stopped?: boolean;
  /** Domanda che ha generato la risposta (per "Riprova"). */
  question?: string;
}

export interface ChatState {
  messages: UiMessage[];
  pending: boolean;
}

export type ChatAction =
  | { type: 'load'; messages: StoredMessage[] }
  | { type: 'send'; text: string; tempId: string }
  | { type: 'event'; event: ChatStreamEvent }
  | { type: 'fail'; message: string; retryable: boolean }
  | { type: 'stop' }
  | { type: 'dropLastExchange' }
  | { type: 'feedback'; messageId: string; rating: FeedbackRating };

export const initialChatState: ChatState = { messages: [], pending: false };

function updateStreaming(state: ChatState, fn: (m: UiMessage) => UiMessage): ChatState {
  const i = state.messages.findLastIndex((m) => m.streaming);
  if (i === -1) return state;
  const messages = [...state.messages];
  messages[i] = fn(messages[i]);
  return { ...state, messages };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'load':
      // Durante uno stream i messaggi locali sono la fonte di verità: un ricaricamento non li sovrascrive.
      return state.pending ? state : { messages: action.messages, pending: false };
    case 'send': {
      const now = new Date().toISOString();
      const base = { status: 'ok' as const, createdAt: now, artifacts: [], sources: [], toolsUsed: [] };
      return {
        pending: true,
        messages: [
          ...state.messages,
          { ...base, id: `${action.tempId}-u`, role: 'user', content: action.text },
          { ...base, id: `${action.tempId}-a`, role: 'assistant', content: '', streaming: true, steps: [], question: action.text },
        ],
      };
    }
    case 'event': {
      const e = action.event;
      switch (e.event) {
        case 'delta':
          return updateStreaming(state, (m) => ({ ...m, content: m.content + e.data.text }));
        case 'tool_start':
          return updateStreaming(state, (m) => ({ ...m, steps: [...(m.steps ?? []), { tool: e.data.tool, status: 'running' }] }));
        case 'tool_end':
          return updateStreaming(state, (m) => {
            const steps = [...(m.steps ?? [])];
            const i = steps.findIndex((s) => s.tool === e.data.tool && s.status === 'running');
            if (i !== -1) steps[i] = { ...steps[i], status: e.data.ok ? 'ok' : 'error', durationMs: e.data.durationMs };
            return { ...m, steps };
          });
        case 'artifact':
          return updateStreaming(state, (m) => ({ ...m, artifacts: [...m.artifacts, e.data] }));
        case 'done': {
          const d = e.data;
          const next = updateStreaming(state, (m) => ({
            ...m,
            id: d.messageId,
            content: d.reply,
            artifacts: d.artifacts,
            sources: d.sources,
            toolsUsed: d.toolsUsed,
            dataAgent: d.dataAgent,
            streaming: false,
          }));
          return { ...next, pending: false };
        }
        case 'error':
          return chatReducer(state, { type: 'fail', message: e.data.message, retryable: e.data.retryable });
        default:
          return state;
      }
    }
    case 'fail': {
      const next = updateStreaming(state, (m) => ({
        ...m,
        status: 'error',
        content: action.message,
        streaming: false,
        retryable: action.retryable,
        steps: m.steps?.map((s) => (s.status === 'running' ? { ...s, status: 'error' } : s)),
      }));
      return { ...next, pending: false };
    }
    case 'stop': {
      // Resta il testo già arrivato; i passi ancora in corso non sono stati completati.
      const next = updateStreaming(state, (m) => ({
        ...m,
        streaming: false,
        stopped: true,
        retryable: true,
        steps: m.steps?.map((s) => (s.status === 'running' ? { ...s, status: 'error' } : s)),
      }));
      return { ...next, pending: false };
    }
    case 'dropLastExchange':
      return { ...state, messages: state.messages.slice(0, -2) };
    case 'feedback':
      return { ...state, messages: state.messages.map((m) => (m.id === action.messageId ? { ...m, feedback: action.rating } : m)) };
  }
}
