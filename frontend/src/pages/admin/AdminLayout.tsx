import { ArrowLeft } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

const LINKS = [
  { to: '/admin', label: 'Panoramica', end: true },
  { to: '/admin/conversazioni', label: 'Conversazioni' },
  { to: '/admin/feedback', label: 'Risposte segnalate' },
  { to: '/admin/costi', label: 'Costi e modelli' },
  { to: '/admin/utenti', label: 'Utenti' },
  { to: '/admin/sistema', label: 'Stato del sistema' },
  { to: '/admin/registro', label: 'Registro accessi' },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <nav aria-label="Dashboard admin" className="bg-inchiostro text-white lg:w-60 lg:shrink-0">
        <div className="px-4 pb-2 pt-5">
          <p className="text-xl font-bold tracking-tight" style={{ fontStretch: '87.5%' }}>LogisticAI</p>
          <p className="text-sm text-white/60">Amministrazione</p>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end} className={({ isActive }) => `block whitespace-nowrap rounded px-3 py-2 text-sm ${isActive ? 'bg-white/10 font-semibold text-segnale' : 'text-white/80 hover:bg-white/10'}`}>
                {l.label}
              </NavLink>
            </li>
          ))}
          <li className="lg:mt-4">
            <NavLink to="/chat" className="flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-sm text-white/60 hover:text-white">
              <ArrowLeft size={14} aria-hidden /> Torna alla chat
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
