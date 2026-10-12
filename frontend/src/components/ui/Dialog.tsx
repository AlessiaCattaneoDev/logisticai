import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';

/** Finestra modale accessibile: Esc e clic sullo sfondo chiudono, il focus entra nel contenuto. */
export function Dialog({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Chiudi"])')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-notte/45 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} rounded-3xl bg-superficie p-6 shadow-[var(--shadow-pop)]`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Chiudi" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
