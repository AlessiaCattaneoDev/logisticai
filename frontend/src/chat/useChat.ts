import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ChatScope, ConversationDetail, FeedbackRating } from '@logisticai/shared';
import { conversationsApi, streamChat } from '../api/endpoints';
import { ApiError } from '../api/http';
import { chatReducer, initialChatState, type ChatAction, type ChatState, type UiMessage } from './state';

/** `scope` vale solo per una conversazione nuova: quelle esistenti hanno già il loro ambito salvato. */
export function useChat(conversationId: string | undefined, onCreated: (id: string) => void, scope?: ChatScope | null) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ChatState>(state);
  stateRef.current = state;

  const detail = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => conversationsApi.get(conversationId!),
    enabled: !!conversationId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (detail.data) dispatch({ type: 'load', messages: detail.data.messages });
  }, [detail.data]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || state.pending) return;
      // Copia locale dello stato: alla fine serve per aggiornare la cache senza ricaricare dal server.
      let local = stateRef.current;
      const apply = (action: ChatAction) => {
        local = chatReducer(local, action);
        dispatch(action);
      };
      apply({ type: 'send', text: message, tempId: crypto.randomUUID() });
      abortRef.current = new AbortController();
      try {
        for await (const event of streamChat({ conversationId, message, ...(!conversationId && scope ? { scope: { type: scope.type, id: scope.id } } : {}) }, abortRef.current.signal)) {
          apply({ type: 'event', event });
          if (event.event === 'done') {
            const id = event.data.conversationId;
            const cached = queryClient.getQueryData<ConversationDetail>(['conversation', id]);
            queryClient.setQueryData<ConversationDetail>(['conversation', id], {
              id,
              title: cached?.title ?? message.slice(0, 60),
              ...((cached?.scope ?? (!conversationId && scope)) ? { scope: cached?.scope ?? scope! } : {}),
              updatedAt: new Date().toISOString(),
              messages: local.messages,
            });
            await queryClient.invalidateQueries({ queryKey: ['conversations'] });
            void queryClient.invalidateQueries({ queryKey: ['home'] });
            if (!conversationId) onCreated(id);
          }
        }
      } catch (err) {
        if (abortRef.current?.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          await queryClient.invalidateQueries({ queryKey: ['me'] });
          return;
        }
        apply({ type: 'fail', message: err instanceof ApiError ? err.message : 'Connessione interrotta. Riprova.', retryable: true });
      }
    },
    [conversationId, onCreated, queryClient, scope, state.pending],
  );

  const retry = useCallback(
    (failed: UiMessage) => {
      if (!failed.question) return;
      dispatch({ type: 'dropLastExchange' });
      // send() parte da stateRef: va allineato subito, senza aspettare il render.
      stateRef.current = chatReducer(stateRef.current, { type: 'dropLastExchange' });
      void send(failed.question);
    },
    [send],
  );

  const sendFeedback = useCallback(async (messageId: string, rating: FeedbackRating, reason?: string, comment?: string) => {
    await conversationsApi.feedback(messageId, { rating, reason: reason as never, comment });
    dispatch({ type: 'feedback', messageId, rating });
  }, []);

  return { messages: state.messages, scope: detail.data?.scope, pending: state.pending, loading: detail.isLoading, notFound: detail.error instanceof ApiError && detail.error.status === 404, send, retry, sendFeedback };
}
