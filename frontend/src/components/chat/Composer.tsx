import { SendHorizontal } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
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
      className="flex items-end gap-2 rounded-md border border-bordo bg-carta p-2 focus-within:border-container"
    >
      <label htmlFor="composer" className="sr-only">Scrivi una domanda</label>
      <textarea
        id="composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        rows={Math.min(6, Math.max(1, text.split('\n').length))}
        maxLength={4000}
        placeholder="Chiedi di un contratto, di una procedura o dei dati delle spedizioni"
        className="flex-1 resize-none bg-transparent px-2 py-1.5 outline-none"
      />
      <button type="submit" disabled={disabled || !text.trim()} className="inline-flex items-center gap-1 rounded bg-container px-3 py-2 text-sm font-medium text-white hover:bg-container-scuro disabled:opacity-40">
        <SendHorizontal size={16} aria-hidden /> Invia
      </button>
    </form>
  );
}
