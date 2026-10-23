import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ChatScope, FeedbackRating } from '@logisticai/shared';
import { conversationsApi, streamChat } from '../api/endpoints';
import { ApiError } from '../api/http';
import { chatReducer, initialChatState, type UiMessage } from './state';

/**
 * Durante lo stream l'unica fonte dei messaggi è il reducer; a risposta completata la conversazione
 * si ricarica dal server (che l'ha salvata) invece di ricostruirla nel client.
 * `scope` vale solo per una conversazione nuova: quelle esistenti hanno già il loro ambito salvato.
 */
export function useChat(conversationId: string | undefined, onCreated: (id: string) => void, scope?: ChatScope | null) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  // Conversazione creata dal server per questa vista ma non ancora aperta (prima risposta interrotta).
  const createdRef = useRef<string | undefined>(undefined);

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
      const target = conversationId ?? createdRef.current;
      dispatch({ type: 'send', text: message, tempId: crypto.randomUUID() });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        for await (const event of streamChat({ conversationId: target, message, ...(!target && scope ? { scope: { type: scope.type, id: scope.id } } : {}) }, controller.signal)) {
          if (event.event === 'start') {
            if (!conversationId) createdRef.current = event.data.conversationId;
            continue;
          }
          dispatch({ type: 'event', event });
          if (event.event === 'done') {
            const id = event.data.conversationId;
            void queryClient.invalidateQueries({ queryKey: ['conversations'] });
            void queryClient.invalidateQueries({ queryKey: ['home'] });
            if (conversationId) {
              await queryClient.invalidateQueries({ queryKey: ['conversation', id] });
            } else {
              // La vista si rimonta su /chat/:id: la conversazione salvata è già in cache, niente schermata vuota.
              await queryClient.prefetchQuery({ queryKey: ['conversation', id], queryFn: () => conversationsApi.get(id) });
              onCreated(id);
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          await queryClient.invalidateQueries({ queryKey: ['me'] });
          return;
        }
        dispatch({ type: 'fail', message: err instanceof ApiError ? err.message : 'Connessione interrotta. Riprova.', retryable: true });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [conversationId, onCreated, queryClient, scope, state.pending],
  );

  /** Interrompe la risposta in corso: il backend riceve l'abort e smette di generare. */
  const stop = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    dispatch({ type: 'stop' });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  const retry = useCallback(
    (failed: UiMessage) => {
      if (!failed.question) return;
      dispatch({ type: 'dropLastExchange' });
      void send(failed.question);
    },
    [send],
  );

  const sendFeedback = useCallback(async (messageId: string, rating: FeedbackRating, reason?: string, comment?: string) => {
    await conversationsApi.feedback(messageId, { rating, reason: reason as never, comment });
    dispatch({ type: 'feedback', messageId, rating });
  }, []);

  return { messages: state.messages, scope: detail.data?.scope, pending: state.pending, loading: detail.isLoading, notFound: detail.error instanceof ApiError && detail.error.status === 404, send, stop, retry, sendFeedback };
}
