import { Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMe } from '../auth/useAuth';
import { useChat } from '../chat/useChat';
import { AssistantMessage } from '../components/chat/AssistantMessage';
import { Composer } from '../components/chat/Composer';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { SuggestedQuestions } from '../components/chat/SuggestedQuestions';

function ChatView({ conversationId }: { conversationId?: string }) {
  const navigate = useNavigate();
  const onCreated = useCallback((id: string) => navigate(`/chat/${id}`, { replace: true }), [navigate]);
  const { messages, pending, loading, notFound, send, retry, sendFeedback } = useChat(conversationId, onCreated);
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, last?.content.length, last?.artifacts.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 md:px-8">
        {notFound && <p role="alert" className="mx-auto max-w-3xl py-10">Questa conversazione non esiste o è stata archiviata.</p>}
        {loading && <p role="status" className="mx-auto max-w-3xl py-10 text-ardesia">Caricamento della conversazione…</p>}
        {!conversationId && messages.length === 0 && <SuggestedQuestions onPick={send} />}
        <div className="mx-auto max-w-4xl space-y-4 py-6">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-md bg-container px-4 py-2.5 text-white">{m.content}</p>
              </div>
            ) : (
              <AssistantMessage key={m.id} message={m} onRetry={retry} onFeedback={sendFeedback} />
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 pb-4 md:px-8">
        <Composer disabled={pending} onSend={send} />
        <p className="mt-2 text-xs text-ardesia">
          Stai usando un assistente AI: verifica le informazioni importanti. Le conversazioni sono registrate per migliorare il servizio.
        </p>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { conversationId } = useParams();
  const { data: user } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;
  return (
    <div className="flex h-dvh">
      <aside className="hidden w-72 shrink-0 lg:block">
        <ConversationSidebar user={user} activeId={conversationId} />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Chiudi menu" className="absolute inset-0 bg-inchiostro/50" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-72">
            <ConversationSidebar user={user} activeId={conversationId} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-bordo bg-carta px-4 py-2 lg:hidden">
          <button type="button" aria-label="Apri conversazioni" onClick={() => setMenuOpen(true)} className="rounded p-1.5">
            <Menu size={20} aria-hidden />
          </button>
          <span className="font-semibold">LogisticAI</span>
        </header>
        <ChatView key={conversationId ?? 'new'} conversationId={conversationId} />
      </main>
    </div>
  );
}
