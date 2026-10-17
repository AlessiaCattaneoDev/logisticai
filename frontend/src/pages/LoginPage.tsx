import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/http';
import { useLogin, useMe } from '../auth/useAuth';
import { Logo } from '../components/brand/Logo';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';

/** Container impilati come nel logo, in grande: il segno della piattaforma. */
function Stack() {
  const boxes = [
    { x: 40, y: 200, w: 150, o: 0.35 }, { x: 200, y: 200, w: 110, o: 0.55 }, { x: 320, y: 200, w: 150, o: 0.3 },
    { x: 100, y: 120, w: 170, o: 0.75 }, { x: 280, y: 120, w: 130, o: 0.45 },
    { x: 170, y: 40, w: 150, o: 1 },
  ];
  return (
    <svg viewBox="0 0 520 300" className="w-full max-w-md" aria-hidden="true">
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={70} rx={14} fill="#ff6f59" opacity={b.o} />
          {Array.from({ length: Math.floor(b.w / 22) - 1 }, (_, k) => (
            <rect key={k} x={b.x + 18 + k * 22} y={b.y + 16} width={4} height={38} rx={2} fill="#fff" opacity={0.18} />
          ))}
        </g>
      ))}
      <circle cx={430} cy={70} r={16} fill="#fdfdfd" />
      <path d="M330 75 C 370 75, 380 70, 410 70" stroke="#fdfdfd" strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to={from} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  const error =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? 'Nome utente o password non corretti.'
        : login.error.message
      : login.error
        ? 'Il server non risponde. Riprova tra poco.'
        : null;

  return (
    <main className="grid min-h-dvh bg-superficie lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-notte p-12 text-white lg:flex">
        <Logo inverse size={36} />
        <div className="py-10">
          <Stack />
        </div>
        <div className="max-w-md">
          <h2 className="text-[32px] font-bold leading-tight">Contratti, procedure e spedizioni in un'unica conversazione.</h2>
          <p className="mt-3 text-[#e6dedd]">Fai una domanda: LogisticAI cerca nei documenti dell'azienda, analizza lo storico delle spedizioni e ti risponde con numeri, grafici e fonti.</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo size={34} />
          </div>
          <h1 className="mt-8 text-[28px] font-bold lg:mt-0">Accedi</h1>
          <p className="mt-1 text-testo-2">Usa le credenziali che ti ha dato il tuo amministratore.</p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Nome utente">
              <Input id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className="h-11" />
            </Field>
            <Field label="Password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
            </Field>
            {error && (
              <p role="alert" className="rounded-[10px] bg-ko-chiaro px-3 py-2 text-sm text-ko">
                {error}
              </p>
            )}
            <Button type="submit" disabled={login.isPending || !username || !password} className="h-11 w-full">
              {login.isPending ? 'Accesso in corso...' : 'Accedi'}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
