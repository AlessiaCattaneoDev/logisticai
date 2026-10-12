import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { AdminUserRow, Role } from '@logisticai/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/http';
import { formatValue } from '../../components/artifacts/format';
import { PageHeader, Panel, QueryState } from '../../components/admin/ui';
import { useMe } from '../../auth/useAuth';

const ROLE_LABEL: Record<Role, string> = { OPERATOR: 'Operatore', ADMIN: 'Amministratore' };

function UserRow({ u, me }: { u: AdminUserRow; me?: string }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const update = useMutation({
    mutationFn: (body: { attivo?: boolean; password?: string }) => adminApi.updateUser(u.id, body),
    onSuccess: () => { setPassword(''); return qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
  });
  return (
    <tr className="border-t border-bordo/70 align-top">
      <td className="px-3 py-2 font-medium">{u.username}<div className="text-xs text-ardesia">{u.alias}</div></td>
      <td className="px-3 py-2">{ROLE_LABEL[u.ruolo]}</td>
      <td className="px-3 py-2">{u.attivo ? 'Attivo' : <span className="text-esito-ko">Disattivato</span>}</td>
      <td className="whitespace-nowrap px-3 py-2">{u.ultimoAccesso ? new Date(u.ultimoAccesso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : 'Mai'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{u.richieste}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatValue(u.costoEur, 'currency_eur')}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {u.id !== me && (
            <button type="button" onClick={() => update.mutate({ attivo: !u.attivo })} className="rounded border border-bordo px-2 py-1 text-sm">
              {u.attivo ? 'Disattiva' : 'Riattiva'}
            </button>
          )}
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); update.mutate({ password }); }}>
            <label className="sr-only" htmlFor={`pw-${u.id}`}>Nuova password per {u.username}</label>
            <input id={`pw-${u.id}`} type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nuova password" className="w-36 rounded border border-bordo px-2 py-1 text-sm" />
            <button type="submit" className="rounded border border-bordo px-2 py-1 text-sm">Reimposta</button>
          </form>
        </div>
        {update.error && <p role="alert" className="mt-1 text-sm text-esito-ko">{update.error instanceof ApiError ? update.error.message : 'Modifica non salvata.'}</p>}
      </td>
    </tr>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data = [], isLoading, error } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users });
  const [form, setForm] = useState({ username: '', password: '', ruolo: 'OPERATOR' as Role });
  const create = useMutation({
    mutationFn: () => adminApi.createUser(form),
    onSuccess: () => { setForm({ username: '', password: '', ruolo: 'OPERATOR' }); return qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
  });
  return (
    <>
      <PageHeader title="Utenti" description="Chi può usare LogisticAI. Le password hanno almeno 10 caratteri." />
      <QueryState isLoading={isLoading} error={error}>
        <div className="overflow-x-auto rounded-md border border-bordo bg-carta">
          <table className="w-full text-sm">
            <thead className="bg-cemento text-left"><tr>{['Utente', 'Ruolo', 'Stato', 'Ultimo accesso', 'Richieste', 'Costo', 'Azioni'].map((h) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${h === 'Richieste' || h === 'Costo' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>{data.map((u) => <UserRow key={u.id} u={u} me={me?.id} />)}</tbody>
          </table>
        </div>
      </QueryState>
      <Panel title="Nuovo utente" className="mt-6">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          <label className="text-sm">Nome utente<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1 block rounded border border-bordo px-2 py-1" /></label>
          <label className="text-sm">Password<input type="password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 block rounded border border-bordo px-2 py-1" /></label>
          <label className="text-sm">Ruolo
            <select value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value as Role })} className="mt-1 block rounded border border-bordo px-2 py-1">
              <option value="OPERATOR">Operatore</option><option value="ADMIN">Amministratore</option>
            </select>
          </label>
          <button type="submit" disabled={create.isPending} className="rounded bg-container px-3 py-1.5 text-sm text-white disabled:opacity-50">Crea utente</button>
          {create.isSuccess && <span role="status" className="text-sm text-esito-ok">Utente creato.</span>}
          {create.error && <span role="alert" className="text-sm text-esito-ko">{create.error instanceof ApiError ? create.error.message : 'Utente non creato.'}</span>}
        </form>
      </Panel>
    </>
  );
}
