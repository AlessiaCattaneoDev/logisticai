import type { ReactNode } from 'react';
import type { DocumentStatus } from '@logisticai/shared';

type Tone = 'neutral' | 'primary' | 'accent' | 'ok' | 'ko';
const tones: Record<Tone, string> = {
  neutral: 'bg-fondo text-testo-2',
  primary: 'bg-primario-chiaro text-primario',
  accent: 'bg-accento-chiaro text-accento-scuro',
  ok: 'bg-ok-chiaro text-ok',
  ko: 'bg-ko-chiaro text-ko',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

const STATUS: Record<DocumentStatus, { tone: Tone; label: string }> = {
  ready: { tone: 'ok', label: 'Disponibile' },
  processing: { tone: 'accent', label: 'In analisi' },
  error: { tone: 'ko', label: 'Errore' },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone}>
      {status === 'processing' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accento" aria-hidden />}
      {s.label}
    </Badge>
  );
}
