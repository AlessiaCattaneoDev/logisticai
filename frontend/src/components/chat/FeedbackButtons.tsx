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
        <button type="button" aria-label="Risposta utile" aria-pressed={current === 'up'} onClick={() => send('up')} className={`rounded p-1.5 ${current === 'up' ? 'bg-container-chiaro text-container' : 'text-ardesia hover:bg-cemento'}`}>
          <ThumbsUp size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Risposta da migliorare" aria-pressed={current === 'down'} aria-expanded={open} onClick={() => setOpen(!open)} className={`rounded p-1.5 ${current === 'down' ? 'bg-container-chiaro text-container' : 'text-ardesia hover:bg-cemento'}`}>
          <ThumbsDown size={16} aria-hidden />
        </button>
        {state === 'sent' && <span role="status" className="ml-2 text-sm text-ardesia">Grazie, valutazione registrata.</span>}
        {state === 'error' && <span role="alert" className="ml-2 text-sm text-esito-ko">Valutazione non salvata. Riprova.</span>}
      </div>
      {open && (
        <form
          className="mt-2 max-w-md rounded-md border border-bordo bg-carta p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send('down', reason || undefined, comment);
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium">Cosa non va in questa risposta?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map((r) => (
                <label key={r} className={`cursor-pointer rounded border px-2 py-1 text-sm ${reason === r ? 'border-container bg-container-chiaro' : 'border-bordo'}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="feedback-comment" className="mt-3 block text-sm">Commento (facoltativo)</label>
          <textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded border border-bordo px-2 py-1 text-sm" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1 text-sm">Annulla</button>
            <button type="submit" disabled={state === 'sending'} className="rounded bg-container px-3 py-1 text-sm text-white disabled:opacity-50">Invia segnalazione</button>
          </div>
        </form>
      )}
    </div>
  );
}
