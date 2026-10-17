import { useQuery } from '@tanstack/react-query';
import { FileText, MessagesSquare, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { ChatScope } from '@logisticai/shared';
import { categoriesApi, documentsApi } from '../api/platform';
import { useChat } from '../chat/useChat';
import { AssistantMessage } from '../components/chat/AssistantMessage';
import { Composer } from '../components/chat/Composer';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { SuggestedQuestions } from '../components/chat/SuggestedQuestions';

/** Ambito richiesto dall'URL (/chat?documento=ID oppure ?categoria=ID), con il nome da mostrare. */
function useRequestedScope(): { scope: ChatScope | null; loading: boolean } {
  const [params] = useSearchParams();
  const documentId = params.get('documento');
  const categoryId = params.get('categoria');
  const doc = useQuery({ queryKey: ['document', documentId], queryFn: () => documentsApi.get(documentId!), enabled: !!documentId });
  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, enabled: !!categoryId });
  return useMemo(() => {
    if (documentId) return { loading: doc.isLoading, scope: doc.data ? { type: 'document', id: doc.data.id, label: doc.data.title } : null };
    if (categoryId) {
      const c = cats.data?.find((x) => x.id === categoryId);
      return { loading: cats.isLoading, scope: c ? { type: 'category', id: c.id, label: c.name } : null };
    }
    return { loading: false, scope: null };
  }, [documentId, categoryId, doc.data, doc.isLoading, cats.data, cats.isLoading]);
}

export function ScopeChip({ scope, onRemove }: { scope: ChatScope; onRemove: () => void }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-accento-chiaro py-1.5 pl-3 pr-1.5 text-sm font-semibold text-accento-scuro">
      <FileText size={15} className="shrink-0" aria-hidden />
      <span className="truncate">Stai chiedendo a: {scope.label}</span>
      <button type="button" onClick={onRemove} aria-label="Togli l'ambito e chiedi a tutta la piattaforma" title="Chiedi a tutta la piattaforma" className="rounded-full p-1 hover:bg-accento/15">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function ChatView({ conversationId, requested }: { conversationId?: string; requested: ChatScope | null }) {
  const navigate = useNavigate();
  const onCreated = useCallback((id: string) => navigate(`/chat/${id}`, { replace: true }), [navigate]);
  const { messages, scope: saved, pending, loading, notFound, send, retry, sendFeedback } = useChat(conversationId, onCreated, requested);
  const scope = conversationId ? (saved ?? null) : requested;
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, last?.content.length, last?.artifacts.length]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {scope && (
        <div className="px-4 pt-4 md:px-8">
          <div className="mx-auto max-w-4xl">
            <ScopeChip scope={scope} onRemove={() => navigate('/chat')} />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 md:px-8">
        {notFound && <p role="alert" className="mx-auto max-w-3xl py-10">Questa conversazione non esiste o è stata archiviata.</p>}
        {loading && <p role="status" className="mx-auto max-w-3xl py-10 text-testo-2">Caricamento della conversazione...</p>}
        {!conversationId && messages.length === 0 && <SuggestedQuestions onPick={send} scope={scope} />}
        <div className="mx-auto max-w-4xl space-y-5 py-6">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-primario px-4 py-2.5 text-testo">{m.content}</p>
              </div>
            ) : (
              <AssistantMessage key={m.id} message={m} onRetry={retry} onFeedback={sendFeedback} />
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 pb-4 md:px-8">
        <Composer disabled={pending} onSend={send} placeholder={scope ? `Fai una domanda su "${scope.label}"` : undefined} />
        <p className="mt-2 text-xs text-testo-2">
          Stai usando un assistente AI: verifica le informazioni importanti. Le conversazioni sono registrate per migliorare il servizio.
        </p>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { conversationId } = useParams();
  const [params] = useSearchParams();
  const { scope: requested, loading } = useRequestedScope();
  const [listOpen, setListOpen] = useState(false);
  const scopeKey = params.get('documento') ?? params.get('categoria') ?? '';
  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 xl:block">
        <ConversationSidebar activeId={conversationId} />
      </aside>
      {listOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button type="button" aria-label="Chiudi conversazioni" className="absolute inset-0 bg-notte/45" onClick={() => setListOpen(false)} />
          <aside className="relative h-full w-72">
            <ConversationSidebar activeId={conversationId} onNavigate={() => setListOpen(false)} />
          </aside>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-bordo bg-superficie px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-card)] xl:hidden"
        >
          <MessagesSquare size={15} aria-hidden /> Conversazioni
        </button>
        {loading ? (
          <p role="status" className="p-8 text-testo-2">Caricamento...</p>
        ) : (
          <ChatView key={`${conversationId ?? 'new'}:${scopeKey}`} conversationId={conversationId} requested={requested} />
        )}
      </div>
    </div>
  );
}
