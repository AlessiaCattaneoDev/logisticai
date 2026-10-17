import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, BAR_RADIUS, ChartTooltip, CURSOR, GRID, X_AXIS } from './chartTheme';
import { formatValue } from './format';

/** Grafico a barre compatto per le schede (home, dashboard), senza barra degli strumenti. */
export function MiniBarChart({
  data, xKey, yKey, label, height = 180, fmtX = String, initialDimension,
}: {
  data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; height?: number; fmtX?: (v: unknown) => string;
  initialDimension?: { width: number; height: number };
}) {
  const fmtY = (v: unknown) => formatValue(v as number, 'integer');
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension ?? { width: 480, height }}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid {...GRID} />
          <XAxis {...X_AXIS} dataKey={xKey} tickFormatter={fmtX} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...AXIS} allowDecimals={false} width={32} />
          <Tooltip cursor={CURSOR} content={(p) => <ChartTooltip {...p} fmtY={fmtY} fmtX={fmtX} />} />
          <Bar dataKey={yKey} name={label} radius={BAR_RADIUS} maxBarSize={28} isAnimationActive={false} fill="#ff6f59" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
