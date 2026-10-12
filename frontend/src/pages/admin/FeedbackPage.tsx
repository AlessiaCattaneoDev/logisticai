import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminFeedbackRow, FeedbackStatus } from '@logisticai/shared';
import { adminApi } from '../../api/admin';
import { PageHeader, QueryState } from '../../components/admin/ui';

const STATI: { id: FeedbackStatus; label: string }[] = [
  { id: 'new', label: 'Da esaminare' },
  { id: 'reviewing', label: 'In analisi' },
  { id: 'resolved', label: 'Risolta' },
];

function FeedbackCard({ f }: { f: AdminFeedbackRow }) {
  const qc = useQueryClient();
  const [stato, setStato] = useState<FeedbackStatus>(f.stato);
  const [nota, setNota] = useState(f.notaAdmin ?? '');
  const save = useMutation({
    mutationFn: () => adminApi.updateFeedback(f.id, { stato, notaAdmin: nota }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });
  return (
    <article className="card p-4" aria-label={`Segnalazione: ${f.domanda}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {f.motivo && <span className="rounded-full bg-ko-chiaro px-2.5 py-0.5 text-xs font-semibold text-ko">{f.motivo}</span>}
        <span className="text-testo-2">{f.utente.alias}, {new Date(f.creato).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <Link to={`/admin/conversazioni/${f.conversationId}`} className="ml-auto font-medium text-primario hover:underline">Apri conversazione</Link>
      </div>
      <p className="mt-3 font-medium">{f.domanda}</p>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-testo-2">{f.risposta}</p>
      {f.commento && <blockquote className="mt-2 border-l-2 border-bordo pl-3 text-sm">"{f.commento}"</blockquote>}
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="text-sm">
          Stato
          <select value={stato} onChange={(e) => setStato(e.target.value as FeedbackStatus)} className="ml-2 rounded-[10px] border border-bordo bg-superficie px-3 py-1.5 focus:border-primario focus:outline-none">
            {STATI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-sm">
          Nota interna
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. aggiunta FAQ sulla giacenza" className="mt-1 block w-full rounded-[10px] border border-bordo bg-superficie px-3 py-1.5 focus:border-primario focus:outline-none" />
        </label>
        <button type="submit" disabled={save.isPending} className="h-9 rounded-[10px] bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-scuro disabled:opacity-50">Salva revisione</button>
        {save.isSuccess && <span role="status" className="text-sm text-ok">Revisione salvata.</span>}
      </form>
    </article>
  );
}

export function FeedbackPage() {
  const [stato, setStato] = useState<FeedbackStatus | undefined>('new');
  const { data = [], isLoading, error } = useQuery({ queryKey: ['admin', 'feedback', stato], queryFn: () => adminApi.feedback(stato) });
  return (
    <>
      <PageHeader title="Segnalazioni" description="Risposte che gli utenti hanno indicato come da migliorare. Usale per correggere documenti e istruzioni dell'assistente." />
      <div className="mb-4 flex gap-2" role="group" aria-label="Filtra per stato">
        {[...STATI, { id: undefined, label: 'Tutte' }].map((s) => (
          <button key={s.label} type="button" aria-pressed={stato === s.id} onClick={() => setStato(s.id as FeedbackStatus | undefined)} className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${stato === s.id ? 'bg-primario text-white' : 'bg-superficie text-testo-2 shadow-[var(--shadow-card)] hover:text-testo'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <QueryState isLoading={isLoading} error={error}>
        <div className="space-y-4">
          {data.map((f) => <FeedbackCard key={f.id} f={f} />)}
          {data.length === 0 && <p className="text-testo-2">Nessuna segnalazione in questo stato.</p>}
        </div>
      </QueryState>
    </>
  );
}
