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

  const renderChart = () => {
    if (type === 'pie') {
      const s = spec.series[0];
      return (
        <PieChart>
          <Pie data={spec.data} dataKey={s.key} nameKey={spec.xKey} innerRadius="45%" outerRadius="80%" paddingAngle={1} isAnimationActive={false}>
            {spec.data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmtY(v)} />
        </PieChart>
      );
    }
    if (type === 'scatter') {
      return (
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#e3e7ec" />
          <XAxis dataKey={spec.xKey} type="number" tickFormatter={fmtX} name={spec.xLabel} />
          <YAxis dataKey={visible[0]?.key} tickFormatter={fmtY} name={spec.yLabel} width={72} />
          <Tooltip formatter={(v) => fmtY(v)} />
          {visible.map((s) => (
            <Scatter key={s.key} name={s.label} data={spec.data} fill={s.color} isAnimationActive={false} />
          ))}
        </ScatterChart>
      );
    }
    const element = (s: (typeof visible)[number]) => {
      const kind = type === 'composed' ? (s.type ?? 'bar') : type;
      const common = { dataKey: s.key, name: s.label, isAnimationActive: false };
      if (kind === 'line') return <Line key={s.key} {...common} type="linear" stroke={s.color} strokeWidth={2} dot={spec.data.length <= 24} connectNulls={false} />;
      if (kind === 'area') return <Area key={s.key} {...common} type="linear" stroke={s.color} fill={s.color} fillOpacity={0.15} stackId={spec.stacked ? 'stack' : undefined} />;
      return <Bar key={s.key} {...common} fill={s.color} stackId={spec.stacked ? 'stack' : undefined} maxBarSize={48} />;
    };
    return (
      <ComposedChart data={spec.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="#e3e7ec" vertical={false} />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={fmtY} />
            <YAxis type="category" dataKey={spec.xKey} tickFormatter={fmtX} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={spec.xKey} tickFormatter={fmtX} />
            <YAxis tickFormatter={fmtY} width={72} domain={type === 'bar' ? [0, 'auto'] : ['auto', 'auto']} />
          </>
        )}
        <Tooltip formatter={(v) => fmtY(v)} labelFormatter={(l) => fmtX(l)} />
        {visible.map(element)}
        {(spec.referenceLines ?? []).map((r) =>
          r.axis === 'y' && !horizontal ? (
            <ReferenceLine key={r.label} y={r.value} ifOverflow="extendDomain" stroke={THRESHOLD_COLOR} strokeWidth={2} strokeDasharray="6 4" label={{ value: r.label, position: 'insideTopRight', fill: '#8a6a06', fontSize: 12 }} />
          ) : (
            <ReferenceLine key={r.label} x={r.value} ifOverflow="extendDomain" stroke={THRESHOLD_COLOR} strokeWidth={2} strokeDasharray="6 4" label={{ value: r.label, position: 'insideTopRight', fill: '#8a6a06', fontSize: 12 }} />
          ),
        )}
      </ComposedChart>
    );
  };

  const body = (
    <figure className="rounded-md border border-bordo bg-carta" aria-label={spec.title}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3 border-b border-bordo px-4 py-3">
        <div>
          <p className="font-semibold">{spec.title}</p>
          {spec.subtitle && <p className="text-sm text-ardesia">{spec.subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Opzioni del grafico">
          {view === 'chart' && (spec.allowedTypes ?? []).length > 1 && (
            <div className="mr-2 inline-flex rounded border border-bordo" role="group" aria-label="Tipo di grafico">
              {spec.allowedTypes!.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={`px-2 py-1 text-sm first:rounded-l last:rounded-r ${type === t ? 'bg-container text-white' : 'hover:bg-container-chiaro'}`}
                >
                  {CHART_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-container hover:bg-container-chiaro">
            {view === 'chart' ? <Table2 size={15} aria-hidden /> : <ChartLine size={15} aria-hidden />}
            {view === 'chart' ? 'Vedi dati' : 'Vedi grafico'}
          </button>
          <button type="button" onClick={() => downloadCsv(`${slug(spec.title)}.csv`, toCsv(table.columns, table.rows))} className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-container hover:bg-container-chiaro">
            <Download size={15} aria-hidden /> Esporta CSV
          </button>
          <button type="button" onClick={() => setFullscreen(!fullscreen)} aria-label={fullscreen ? 'Chiudi schermo intero' : 'Schermo intero'} className="rounded p-1.5 text-container hover:bg-container-chiaro">
            {fullscreen ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          </button>
        </div>
      </figcaption>
      {view === 'table' ? (
        <div className="p-3">
          <DataTable spec={table} compact />
        </div>
      ) : (
        <div className="px-2 pb-3 pt-4">
          <div style={{ height: fullscreen ? '70vh' : 320 }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
              {renderChart()}
            </ResponsiveContainer>
          </div>
          {type !== 'pie' && spec.series.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-2 px-2" aria-label="Serie del grafico">
              {spec.series.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={!hidden.has(s.key)}
                    onClick={() => toggleSeries(s.key)}
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-sm ${hidden.has(s.key) ? 'text-ardesia line-through' : ''}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(i, s.color) }} aria-hidden />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {type === 'pie' && (
            <ul className="mt-2 flex flex-wrap gap-2 px-2" aria-label="Categorie">
              {spec.data.map((d, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(i) }} aria-hidden />
                  {fmtX(d[spec.xKey])}: {fmtY(d[spec.series[0].key])}
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
    <div role="dialog" aria-modal="true" aria-label={spec.title} className="fixed inset-0 z-50 flex items-center justify-center bg-inchiostro/60 p-6">
      <div className="w-full max-w-6xl">{body}</div>
    </div>
  );
}
