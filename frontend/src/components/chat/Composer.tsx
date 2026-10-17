import { SendHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

export function Composer({ disabled, onSend, placeholder }: { disabled: boolean; onSend: (text: string) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-2xl border border-bordo bg-superficie p-2 shadow-[var(--shadow-card)] transition-shadow focus-within:border-primario focus-within:ring-4 focus-within:ring-primario/10"
    >
      <label htmlFor="composer" className="sr-only">Scrivi una domanda</label>
      <textarea
        id="composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        rows={Math.min(6, Math.max(1, text.split('\n').length))}
        maxLength={4000}
        placeholder={placeholder ?? 'Chiedi di un contratto, di una procedura o dei dati delle spedizioni'}
        className="flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-testo-2/70"
      />
      <button type="submit" disabled={disabled || !text.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primario px-4 text-sm font-semibold text-testo transition-colors hover:bg-primario-scuro disabled:opacity-40">
        <SendHorizontal size={16} aria-hidden /> Invia
      </button>
    </form>
  );
}
