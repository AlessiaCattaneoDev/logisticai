import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, Plus } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { conversationsApi } from '../../api/endpoints';

/** Colonna delle conversazioni dentro la pagina della chat. */
export function ConversationSidebar({ activeId, onNavigate }: { activeId?: string; onNavigate?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: conversations = [] } = useQuery({ queryKey: ['conversations'], queryFn: conversationsApi.list });
  const archive = useMutation({
    mutationFn: conversationsApi.archive,
    onSuccess: async (_d, id) => {
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      await qc.invalidateQueries({ queryKey: ['home'] });
      if (id === activeId) navigate('/chat');
    },
  });

  return (
    <nav aria-label="Conversazioni" className="flex h-full flex-col border-r border-bordo bg-superficie">
      <div className="p-3">
        <NavLink to="/chat" end onClick={onNavigate} className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primario text-sm font-semibold text-white transition-colors hover:bg-primario-scuro">
          <Plus size={16} aria-hidden /> Nuova conversazione
        </NavLink>
      </div>
      <p className="px-5 pb-1 pt-2 text-xs font-medium text-testo-2">Le tue conversazioni</p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.map((c) => (
          <li key={c.id} className="group flex items-center rounded-[10px] hover:bg-fondo">
            <NavLink
              to={`/chat/${c.id}`}
              onClick={onNavigate}
              className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-3 py-2 text-sm ${isActive ? 'bg-primario-chiaro font-semibold text-primario' : 'text-testo'}`}
            >
              {c.scope && <FileText size={14} className="shrink-0 text-accento" aria-label={`Su: ${c.scope.label}`} />}
              <span className="truncate">{c.title}</span>
            </NavLink>
            <button
              type="button"
              aria-label={`Archivia la conversazione "${c.title}"`}
              onClick={() => archive.mutate(c.id)}
              className="mr-1 rounded-lg p-1.5 text-testo-2 opacity-0 hover:bg-superficie hover:text-testo focus:opacity-100 group-hover:opacity-100"
            >
              <Archive size={14} aria-hidden />
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="px-3 py-2 text-sm text-testo-2">Le tue conversazioni compariranno qui.</li>}
      </ul>
    </nav>
  );
}
