import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/http';
import { useLogin, useMe } from '../auth/useAuth';

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/chat';
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
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">LogisticAI</h1>
        <p className="mt-2 text-ardesia">Contratti, procedure e dati delle spedizioni di Padana Logistics in un'unica conversazione.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-md border border-bordo bg-carta p-6" noValidate>
          <div>
            <label htmlFor="username" className="block text-sm font-medium">Nome utente</label>
            <input id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded border border-bordo px-3 py-2" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border border-bordo px-3 py-2" />
          </div>
          {error && <p role="alert" className="text-sm text-esito-ko">{error}</p>}
          <button type="submit" disabled={login.isPending || !username || !password} className="w-full rounded bg-container px-4 py-2 font-medium text-white hover:bg-container-scuro disabled:opacity-50">
            {login.isPending ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </main>
  );
}
