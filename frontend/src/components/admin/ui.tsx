import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ardesia">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-bordo bg-carta p-4 ${className}`} aria-label={title}>
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function QueryState({ isLoading, error, children }: { isLoading: boolean; error: unknown; children: ReactNode }) {
  if (isLoading) return <p role="status" className="text-ardesia">Caricamento…</p>;
  if (error) return <p role="alert" className="text-esito-ko">{error instanceof Error ? error.message : 'Dati non disponibili.'}</p>;
  return <>{children}</>;
}

/** Barra di consumo del budget: gialla oltre l'80%, rossa oltre il 100%. */
export function BudgetBar({ used, budget, label }: { used: number; budget: number; label: string }) {
  const pct = budget > 0 ? used / budget : 0;
  const color = pct >= 1 ? 'bg-esito-ko' : pct >= 0.8 ? 'bg-segnale' : 'bg-container';
  return (
    <div className="mt-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={budget} aria-valuenow={used}>
      <div className="h-1.5 overflow-hidden rounded bg-cemento">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ardesia">{Math.round(pct * 100)}% del budget</p>
    </div>
  );
}
