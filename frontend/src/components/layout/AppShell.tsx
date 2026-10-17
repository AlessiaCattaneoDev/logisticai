import { useQuery } from '@tanstack/react-query';
import {
  Activity, BarChart3, FileText, Flag, Home, LayoutDashboard, LogOut, Menu, MessageSquare, MessagesSquare, ScrollText, Users, X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { AuthUser } from '@logisticai/shared';
import { homeApi } from '../../api/platform';
import { useLogout, useMe } from '../../auth/useAuth';
import { Logo } from '../brand/Logo';

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number }

const MAIN: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/documenti', label: 'Documenti', icon: FileText },
];

function adminItems(segnalazioni: number): NavItem[] {
  return [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/conversazioni', label: 'Conversazioni', icon: MessagesSquare },
    { to: '/admin/feedback', label: 'Segnalazioni', icon: Flag, badge: segnalazioni },
    { to: '/admin/costi', label: 'Costi e modelli', icon: BarChart3 },
    { to: '/admin/utenti', label: 'Utenti', icon: Users },
    { to: '/admin/sistema', label: 'Sistema', icon: Activity },
    { to: '/admin/registro', label: 'Registro accessi', icon: ScrollText },
  ];
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors ${isActive ? 'bg-primario font-semibold text-testo' : 'text-[#e6dedd] hover:bg-white/8 hover:text-white'}`
            }
          >
            <Icon size={17} aria-hidden />
            <span className="flex-1">{label}</span>
            {!!badge && (
              <span className="rounded-full bg-accento px-1.5 text-[11px] font-bold text-testo" aria-label={`${badge} da rivedere`}>
                {badge}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Sidebar({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const isAdmin = user.role === 'ADMIN';
  // Il conteggio delle segnalazioni arriva dalla stessa API della home (già in cache se si parte da lì).
  const { data: home } = useQuery({ queryKey: ['home'], queryFn: homeApi.get, enabled: isAdmin, staleTime: 60_000 });
  return (
    <nav aria-label="Menu principale" className="flex h-full flex-col bg-notte px-3 pb-3 pt-5">
      <div className="mb-6 px-2">
        <Logo inverse size={30} />
      </div>
      <NavList items={MAIN} onNavigate={onNavigate} />
      {isAdmin && (
        <>
          <p className="mb-1.5 mt-6 px-3 text-xs font-medium text-notte-3">Amministrazione</p>
          <NavList items={adminItems(home?.admin?.segnalazioniDaRivedere ?? 0)} onNavigate={onNavigate} />
        </>
      )}
      <div className="mt-auto flex items-center gap-3 rounded-xl bg-notte-2 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primario text-sm font-bold uppercase text-testo" aria-hidden>
          {user.username.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user.username}</p>
          <p className="text-xs text-notte-3">{isAdmin ? 'Amministratore' : 'Operatore'}</p>
        </div>
        <button
          type="button"
          aria-label="Esci"
          title="Esci"
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
          className="rounded-lg p-1.5 text-notte-3 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}

/** Guscio dell'app: menu laterale fisso da desktop, a scomparsa su tablet e telefono. */
export function AppShell() {
  const { data: user } = useMe();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  if (!user) return null;
  return (
    <div className="flex h-dvh bg-fondo">
      <aside className="hidden w-64 shrink-0 lg:block">
        <Sidebar user={user} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Chiudi menu" className="absolute inset-0 bg-notte/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72">
            <Sidebar user={user} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-bordo bg-superficie px-4 py-2.5 lg:hidden">
          <button type="button" aria-label="Apri menu" onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-testo-2 hover:bg-primario-chiaro">
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
          <Logo size={26} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Contenitore standard delle pagine (la chat usa tutta l'altezza e non lo usa). */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? 'max-w-[1400px]' : 'max-w-6xl'} px-4 py-6 md:px-8 md:py-8`}>{children}</div>;
}
