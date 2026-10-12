import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { FEEDBACK_REASONS, type FeedbackRating } from '@logisticai/shared';

interface Props {
  current?: FeedbackRating;
  onSubmit: (rating: FeedbackRating, reason?: string, comment?: string) => Promise<void>;
}

export function FeedbackButtons({ current, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const send = async (rating: FeedbackRating, r?: string, c?: string) => {
    setState('sending');
    try {
      await onSubmit(rating, r, c || undefined);
      setState('sent');
      setOpen(false);
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Risposta utile" aria-pressed={current === 'up'} onClick={() => send('up')} className={`rounded-lg p-1.5 transition-colors ${current === 'up' ? 'bg-primario-chiaro text-primario' : 'text-testo-2 hover:bg-fondo'}`}>
          <ThumbsUp size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Risposta da migliorare" aria-pressed={current === 'down'} aria-expanded={open} onClick={() => setOpen(!open)} className={`rounded-lg p-1.5 transition-colors ${current === 'down' ? 'bg-primario-chiaro text-primario' : 'text-testo-2 hover:bg-fondo'}`}>
          <ThumbsDown size={16} aria-hidden />
        </button>
        {state === 'sent' && <span role="status" className="ml-2 text-sm text-testo-2">Grazie, valutazione registrata.</span>}
        {state === 'error' && <span role="alert" className="ml-2 text-sm text-ko">Valutazione non salvata. Riprova.</span>}
      </div>
      {open && (
        <form
          className="mt-2 max-w-md rounded-2xl border border-bordo-tenue bg-fondo p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send('down', reason || undefined, comment);
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium">Cosa non va in questa risposta?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map((r) => (
                <label key={r} className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors ${reason === r ? 'border-primario bg-primario-chiaro font-semibold text-primario' : 'border-bordo bg-superficie hover:border-primario'}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="feedback-comment" className="mt-3 block text-sm">Commento (facoltativo)</label>
          <textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-[10px] border border-bordo bg-superficie px-3 py-2 text-sm focus:border-primario focus:outline-none" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-testo-2 hover:bg-superficie">Annulla</button>
            <button type="submit" disabled={state === 'sending'} className="rounded-lg bg-primario px-3 py-1.5 text-sm font-semibold text-white hover:bg-primario-scuro disabled:opacity-50">Invia segnalazione</button>
          </div>
        </form>
      )}
    </div>
  );
}
