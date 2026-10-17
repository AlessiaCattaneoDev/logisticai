import type { TooltipContentProps } from 'recharts';

// Stile comune a tutti i grafici (risposte della chat, home, dashboard admin).
export const GRID = { stroke: '#efe9e8', vertical: false } as const;
export const AXIS = { tick: { fill: '#6e6260', fontSize: 12 }, tickLine: false, axisLine: false, tickMargin: 8 } as const;
export const X_AXIS = { ...AXIS, axisLine: { stroke: '#e6dedd' } } as const;
export const CURSOR = { fill: '#fff0ed', opacity: 0.7 } as const;
export const BAR_RADIUS: [number, number, number, number] = [6, 6, 2, 2];
export const BAR_RADIUS_H: [number, number, number, number] = [2, 6, 6, 2];

type Fmt = (v: unknown) => string;

/** Tooltip a scheda: titolo della categoria e una riga per serie con il suo colore. */
export function ChartTooltip({ active, payload, label, fmtY, fmtX }: Partial<TooltipContentProps> & { fmtY: Fmt; fmtX?: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-bordo-tenue bg-superficie px-3 py-2.5 text-sm shadow-[var(--shadow-pop)]">
      {label !== undefined && label !== '' && <p className="mb-1.5 font-semibold">{fmtX ? fmtX(label) : String(label)}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: (p.color ?? (p.payload as { fill?: string })?.fill) as string }} aria-hidden />
            <span className="flex-1 text-testo-2">{p.name}</span>
            <span className="font-semibold tabular-nums">{fmtY(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
