import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { adminApi } from '../../api/admin';
import { formatValue } from '../../components/artifacts/format';
import { usePeriod } from '../../components/admin/period';
import { PeriodPicker } from '../../components/admin/PeriodPicker';
import { useNames } from '../../components/admin/useNames';
import { PageHeader, QueryState } from '../../components/admin/ui';

const TOOL_LABEL: Record<string, string> = { cerca_knowledge_base: 'Documenti', analizza_dati: 'Dati' };

export function ConversationsPage() {
  const [period] = usePeriod();
  const [q, setQ] = useState('');
  const [onlyDown, setOnlyDown] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const names = useNames();
  const filters = { ...period, q: q.trim() || undefined, feedback: onlyDown ? ('down' as const) : undefined, errori: onlyErrors || undefined };
  const { data = [], isLoading, error } = useQuery({ queryKey: ['admin', 'conversations', filters], queryFn: () => adminApi.conversations(filters) });

  return (
    <>
      <PageHeader title="Conversazioni" description="Ogni apertura di una conversazione viene registrata. Gli utenti sono mostrati con uno pseudonimo." actions={<PeriodPicker />} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nel testo" aria-label="Cerca nelle conversazioni" className="w-64 rounded border border-bordo px-3 py-1.5" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDown} onChange={(e) => setOnlyDown(e.target.checked)} /> Solo con risposte segnalate</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Solo con errori</label>
        <button type="button" onClick={() => (names.revealed ? names.hide() : void names.reveal())} className="ml-auto inline-flex items-center gap-1.5 rounded border border-bordo bg-carta px-3 py-1.5 text-sm">
          {names.revealed ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          {names.revealed ? 'Nascondi nomi' : 'Mostra nomi'}
        </button>
      </div>
      <QueryState isLoading={isLoading} error={error}>
        <div className="overflow-x-auto rounded-md border border-bordo bg-carta">
          <table className="w-full text-sm">
            <thead className="bg-cemento text-left">
              <tr>
                {['Conversazione', 'Utente', 'Aggiornata', 'Messaggi', 'Strumenti', 'Segnalazioni', 'Errori', 'Costo'].map((h) => (
                  <th key={h} scope="col" className={`px-3 py-2 font-semibold ${['Messaggi', 'Segnalazioni', 'Errori', 'Costo'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-bordo/70">
                  <td className="max-w-xs truncate px-3 py-2"><Link to={`/admin/conversazioni/${c.id}`} className="text-container hover:underline">{c.titolo}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2">{names.label(c.utente)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(c.aggiornata).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.messaggi}</td>
                  <td className="px-3 py-2">{c.strumenti.map((t) => TOOL_LABEL[t] ?? t).join(', ') || 'Nessuno'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.feedbackNegativi ? 'font-semibold text-esito-ko' : ''}`}>{c.feedbackNegativi}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.errori ? 'font-semibold text-esito-ko' : ''}`}>{c.errori}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(c.costoEur, 'currency_eur')}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-ardesia">Nessuna conversazione con questi filtri.</td></tr>}
            </tbody>
          </table>
        </div>
      </QueryState>
    </>
  );
}
