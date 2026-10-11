import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, LogOut, Plus } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import type { AuthUser } from '@logisticai/shared';
import { conversationsApi } from '../../api/endpoints';
import { useLogout } from '../../auth/useAuth';

export function ConversationSidebar({ user, activeId, onNavigate }: { user: AuthUser; activeId?: string; onNavigate?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: conversations = [] } = useQuery({ queryKey: ['conversations'], queryFn: conversationsApi.list });
  const archive = useMutation({
    mutationFn: conversationsApi.archive,
    onSuccess: async (_d, id) => {
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      if (id === activeId) navigate('/chat');
    },
  });

  return (
    <nav aria-label="Conversazioni" className="flex h-full flex-col bg-inchiostro text-white">
      <div className="px-4 pb-3 pt-5">
        <p className="text-xl font-bold tracking-tight" style={{ fontStretch: '87.5%' }}>LogisticAI</p>
        <p className="text-sm text-white/60">Padana Logistics</p>
      </div>
      <div className="px-3">
        <NavLink to="/chat" end onClick={onNavigate} className="flex items-center gap-2 rounded bg-container px-3 py-2 text-sm font-medium hover:bg-container-scuro">
          <Plus size={16} aria-hidden /> Nuova conversazione
        </NavLink>
      </div>
      <ul className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {conversations.map((c) => (
          <li key={c.id} className="group flex items-center rounded hover:bg-white/10">
            <NavLink
              to={`/chat/${c.id}`}
              onClick={onNavigate}
              className={({ isActive }) => `flex-1 truncate px-3 py-2 text-sm ${isActive ? 'font-semibold text-segnale' : 'text-white/85'}`}
            >
              {c.title}
            </NavLink>
            <button type="button" aria-label={`Archivia la conversazione "${c.title}"`} onClick={() => archive.mutate(c.id)} className="mr-1 rounded p-1.5 text-white/50 opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100">
              <Archive size={14} aria-hidden />
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="px-3 py-2 text-sm text-white/50">Le tue conversazioni compariranno qui.</li>}
      </ul>
      <div className="border-t border-white/10 px-4 py-3 text-sm">
        <p className="font-medium">{user.username}</p>
        <div className="mt-1 flex items-center justify-between text-white/60">
          <span>{user.role === 'ADMIN' ? 'Amministratore' : 'Operatore'}</span>
          <button type="button" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })} className="inline-flex items-center gap-1 hover:text-white">
            <LogOut size={14} aria-hidden /> Esci
          </button>
        </div>
      </div>
    </nav>
  );
}
