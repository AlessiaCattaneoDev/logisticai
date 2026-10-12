import { Download, Maximize2, Minimize2, Table2, ChartLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartSpec, ChartType, TableSpec } from '@logisticai/shared';
import { downloadCsv, slug, toCsv } from './csv';
import { DataTable } from './DataTable';
import { formatCategory, formatValue, isMonthlySeries } from './format';
import { AXIS, BAR_RADIUS, BAR_RADIUS_H, ChartTooltip, CURSOR, GRID, X_AXIS } from './chartTheme';
import { seriesColor, THRESHOLD_COLOR } from './palette';

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Barre',
  line: 'Linee',
  area: 'Aree',
  pie: 'Torta',
  scatter: 'Dispersione',
  composed: 'Combinato',
};

/** Le stesse righe del grafico come TableSpec, per "Vedi dati" e per l'export. */
export function chartAsTable(spec: ChartSpec): TableSpec {
  return {
    kind: 'table',
    id: `${spec.id}-dati`,
    title: spec.title,
    columns: [
      { key: spec.xKey, label: spec.xLabel ?? spec.xKey, format: 'string' },
      ...spec.series.map((s) => ({ key: s.key, label: s.label, format: spec.yFormat ?? ('number' as const) })),
    ],
    rows: spec.data,
  };
}

interface Props {
  spec: ChartSpec;
  /** Dimensione iniziale per ambienti senza layout (test). */
  initialDimension?: { width: number; height: number };
}

export function DataChart({ spec, initialDimension }: Props) {
  const [type, setType] = useState<ChartType>(spec.type);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [fullscreen, setFullscreen] = useState(false);
  const table = useMemo(() => chartAsTable(spec), [spec]);
  const fmtY = (v: unknown) => formatValue(v as number, spec.yFormat);
  const monthly = useMemo(() => isMonthlySeries(spec.data.map((d) => d[spec.xKey])), [spec]);
  const fmtX = (v: unknown) => formatCategory(v as string, monthly);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visible = spec.series.map((s, i) => ({ ...s, color: seriesColor(i, s.color) })).filter((s) => !hidden.has(s.key));
  const horizontal = !!spec.horizontal && type === 'bar';

  const tooltip = <Tooltip cursor={CURSOR} content={(p) => <ChartTooltip {...p} fmtY={fmtY} fmtX={type === 'scatter' ? undefined : fmtX} />} />;

  const renderChart = () => {
    if (type === 'pie') {
      const s = spec.series[0];
      return (
        <PieChart>
          <Pie data={spec.data} dataKey={s.key} nameKey={spec.xKey} innerRadius="55%" outerRadius="85%" paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}>
            {spec.data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Pie>
          <Tooltip content={(p) => <ChartTooltip {...p} fmtY={fmtY} />} />
        </PieChart>
      );
    }
    if (type === 'scatter') {
      return (
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid {...GRID} vertical />
          <XAxis {...X_AXIS} dataKey={spec.xKey} type="number" tickFormatter={fmtX} name={spec.xLabel} />
          <YAxis {...AXIS} dataKey={visible[0]?.key} tickFormatter={fmtY} name={spec.yLabel} width={72} />
          {tooltip}
          {visible.map((s) => (
            <Scatter key={s.key} name={s.label} data={spec.data} fill={s.color} fillOpacity={0.75} isAnimationActive={false} />
          ))}
        </ScatterChart>
      );
    }
    const lastBar = [...visible].reverse().find((s) => (type === 'composed' ? (s.type ?? 'bar') : type) === 'bar')?.key;
    const element = (s: (typeof visible)[number]) => {
      const kind = type === 'composed' ? (s.type ?? 'bar') : type;
      const common = { dataKey: s.key, name: s.label, isAnimationActive: false };
      if (kind === 'line')
        return <Line key={s.key} {...common} type="linear" stroke={s.color} strokeWidth={2.5} dot={spec.data.length <= 24 ? { r: 3.5, fill: s.color, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} />;
      if (kind === 'area')
        return <Area key={s.key} {...common} type="linear" stroke={s.color} strokeWidth={2.5} fill={`url(#grad-${spec.id}-${s.key})`} stackId={spec.stacked ? 'stack' : undefined} />;
      // Con le barre impilate si arrotonda solo l'ultima serie, quella in cima.
      const rounded = !spec.stacked || s.key === lastBar;
      return <Bar key={s.key} {...common} fill={s.color} stackId={spec.stacked ? 'stack' : undefined} maxBarSize={44} radius={rounded ? (horizontal ? BAR_RADIUS_H : BAR_RADIUS) : 0} />;
    };
    return (
      <ComposedChart data={spec.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barGap={4} barCategoryGap="22%">
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`grad-${spec.id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis {...AXIS} type="number" tickFormatter={fmtY} />
            <YAxis {...AXIS} type="category" dataKey={spec.xKey} tickFormatter={fmtX} width={128} />
          </>
        ) : (
          <>
            <XAxis {...X_AXIS} dataKey={spec.xKey} tickFormatter={fmtX} />
            <YAxis {...AXIS} tickFormatter={fmtY} width={72} domain={type === 'bar' ? [0, 'auto'] : ['auto', 'auto']} />
          </>
        )}
        {tooltip}
        {visible.map(element)}
        {(spec.referenceLines ?? []).map((r) => {
          const label = { value: r.label, position: 'insideTopRight' as const, fill: '#b4530c', fontSize: 12, fontWeight: 600 };
          const line = { ifOverflow: 'extendDomain' as const, stroke: THRESHOLD_COLOR, strokeWidth: 2, strokeDasharray: '6 5', label };
          return r.axis === 'y' && !horizontal ? <ReferenceLine key={r.label} y={r.value} {...line} /> : <ReferenceLine key={r.label} x={r.value} {...line} />;
        })}
      </ComposedChart>
    );
  };

  const toolBtn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-testo-2 transition-colors hover:bg-primario-chiaro hover:text-primario';
  const body = (
    <figure className="card overflow-hidden" aria-label={spec.title}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-4">
        <div>
          <p className="font-semibold">{spec.title}</p>
          {spec.subtitle && <p className="text-sm text-testo-2">{spec.subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Opzioni del grafico">
          {view === 'chart' && (spec.allowedTypes ?? []).length > 1 && (
            <div className="mr-1 inline-flex rounded-full bg-fondo p-0.5" role="group" aria-label="Tipo di grafico">
              {spec.allowedTypes!.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${type === t ? 'bg-superficie text-primario shadow-[var(--shadow-card)]' : 'text-testo-2 hover:text-testo'}`}
                >
                  {CHART_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className={toolBtn}>
            {view === 'chart' ? <Table2 size={15} aria-hidden /> : <ChartLine size={15} aria-hidden />}
            {view === 'chart' ? 'Vedi dati' : 'Vedi grafico'}
          </button>
          <button type="button" onClick={() => downloadCsv(`${slug(spec.title)}.csv`, toCsv(table.columns, table.rows))} className={toolBtn}>
            <Download size={15} aria-hidden /> Esporta CSV
          </button>
          <button type="button" onClick={() => setFullscreen(!fullscreen)} aria-label={fullscreen ? 'Chiudi schermo intero' : 'Schermo intero'} className={toolBtn}>
            {fullscreen ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          </button>
        </div>
      </figcaption>
      {view === 'table' ? (
        <div className="p-4">
          <DataTable spec={table} compact />
        </div>
      ) : (
        <div className="px-3 pb-4 pt-3">
          <div style={{ height: fullscreen ? '70vh' : 320 }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
              {renderChart()}
            </ResponsiveContainer>
          </div>
          {type !== 'pie' && spec.series.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-1.5 px-2" aria-label="Serie del grafico">
              {spec.series.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={!hidden.has(s.key)}
                    onClick={() => toggleSeries(s.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${hidden.has(s.key) ? 'border-bordo text-testo-2 line-through opacity-60' : 'border-bordo-tenue bg-fondo hover:border-bordo'}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(i, s.color) }} aria-hidden />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {type === 'pie' && (
            <ul className="mt-3 flex flex-wrap gap-1.5 px-2" aria-label="Categorie">
              {spec.data.map((d, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-fondo px-2.5 py-1 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(i) }} aria-hidden />
                  {fmtX(d[spec.xKey])}: <span className="tabular-nums">{fmtY(d[spec.series[0].key])}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </figure>
  );

  if (!fullscreen) return body;
  return (
    <div role="dialog" aria-modal="true" aria-label={spec.title} className="fixed inset-0 z-50 flex items-center justify-center bg-notte/55 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-6xl">{body}</div>
    </div>
  );
}
