export const SERVICE_LABEL: Record<string, string> = {
  backend: 'Backend',
  database: 'Database',
  chroma: 'Ricerca nei documenti (ChromaDB)',
  dataAgent: 'Analista dati (Python)',
};

export function ServiceList({ services }: { services: Record<string, 'ok' | 'down'> }) {
  return (
    <ul className="space-y-2">
      {Object.entries(services).map(([k, v]) => (
        <li key={k} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <span aria-hidden className={`h-2 w-2 rounded-full ${v === 'ok' ? 'bg-ok' : 'bg-ko'}`} />
            {SERVICE_LABEL[k] ?? k}
          </span>
          <span className={v === 'ok' ? 'text-testo-2' : 'font-semibold text-ko'}>{v === 'ok' ? 'attivo' : 'non raggiungibile'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Barra di consumo del budget: arancio oltre l'80%, rossa oltre il 100%. */
export function BudgetBar({ used, budget, label, inverse = false }: { used: number; budget: number; label: string; inverse?: boolean }) {
  const pct = budget > 0 ? used / budget : 0;
  const color = pct >= 1 ? 'bg-ko' : pct >= 0.8 ? 'bg-accento' : inverse ? 'bg-white' : 'bg-primario';
  return (
    <div className="mt-3" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={budget} aria-valuenow={used}>
      <div className={`h-1.5 overflow-hidden rounded-full ${inverse ? 'bg-white/25' : 'bg-bordo-tenue'}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <p className={`mt-1.5 text-xs ${inverse ? 'text-white/75' : 'text-testo-2'}`}>{Math.round(pct * 100)}% del budget</p>
    </div>
  );
}

export function QueryState({ isLoading, error, children }: { isLoading: boolean; error: unknown; children: React.ReactNode }) {
  if (isLoading) return <p role="status" className="text-testo-2">Caricamento...</p>;
  if (error) return <p role="alert" className="rounded-[10px] bg-ko-chiaro px-3 py-2 text-ko">{error instanceof Error ? error.message : 'Dati non disponibili.'}</p>;
  return <>{children}</>;
}
