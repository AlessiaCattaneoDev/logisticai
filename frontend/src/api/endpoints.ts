import type {
  AuthUser,
  ChatRequest,
  ChatStreamEvent,
  ConversationDetail,
  ConversationSummary,
  FeedbackRequest,
} from '@logisticai/shared';
import { api, apiUrl, ApiError } from './http';
import { parseSse } from './sse';

export const authApi = {
  me: () => api<AuthUser>('/api/auth/me'),
  login: (username: string, password: string) =>
    api<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api<void>('/api/auth/logout', { method: 'POST' }),
};

export const conversationsApi = {
  list: () => api<ConversationSummary[]>('/api/conversations'),
  get: (id: string) => api<ConversationDetail>(`/api/conversations/${id}`),
  archive: (id: string) => api<void>(`/api/conversations/${id}`, { method: 'DELETE' }),
  feedback: (messageId: string, body: FeedbackRequest) =>
    api<{ rating: string }>(`/api/messages/${messageId}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
};

export async function* streamChat(input: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'Il server non risponde. Riprova tra poco.');
  }
  for await (const msg of parseSse(res.body)) {
    yield { event: msg.event, data: msg.data } as ChatStreamEvent;
  }
}
