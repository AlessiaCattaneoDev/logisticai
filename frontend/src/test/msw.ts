import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AuthUser, ChatStreamEvent, ConversationDetail, ConversationSummary } from '@logisticai/shared';

export const sara: AuthUser = { id: 'u1', username: 'sara.operatrice', role: 'OPERATOR' };

export function sseResponse(events: ChatStreamEvent[]) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      c.close();
    },
  });
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

export const state: { user: AuthUser | null; conversations: ConversationSummary[]; details: Record<string, ConversationDetail> } = {
  user: null,
  conversations: [],
  details: {},
};

export const server = setupServer(
  http.get('*/api/auth/me', () => (state.user ? HttpResponse.json(state.user) : HttpResponse.json({ error: 'Autenticazione richiesta' }, { status: 401 }))),
  http.post('*/api/auth/logout', () => {
    state.user = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('*/api/conversations', () => HttpResponse.json(state.conversations)),
  http.get('*/api/conversations/:id', ({ params }) => {
    const d = state.details[params.id as string];
    return d ? HttpResponse.json(d) : HttpResponse.json({ error: 'Conversazione non trovata' }, { status: 404 });
  }),
);
