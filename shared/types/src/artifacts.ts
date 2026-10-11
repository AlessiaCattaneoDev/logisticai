// Spec di grafici e tabelle prodotte dal data agent e visualizzate dai componenti React.
// Il modello pydantic in data_agent/specs.py deve restare equivalente: lo garantiscono
// le fixture in shared/contracts/fixtures, validate da entrambi i lati.
import { z } from 'zod';

export const MAX_CHART_POINTS = 500;
export const MAX_TABLE_ROWS = 1000;

export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'scatter', 'composed'] as const;
export const VALUE_FORMATS = [
  'number',
  'integer',
  'percent',
  'currency_eur',
  'duration_min',
  'date',
  'string',
] as const;

const cellValue = z.union([z.string(), z.number(), z.null()]);
const row = z.record(z.string(), cellValue);

export const chartTypeSchema = z.enum(CHART_TYPES);
export const valueFormatSchema = z.enum(VALUE_FORMATS);

export const chartSeriesSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['bar', 'line', 'area']).optional(),
  color: z.string().optional(),
});

export const referenceLineSchema = z.object({
  axis: z.enum(['x', 'y']),
  value: z.number(),
  label: z.string(),
});

export const chartSpecSchema = z
  .object({
    kind: z.literal('chart'),
    id: z.string().min(1),
    type: chartTypeSchema,
    title: z.string().min(1),
    subtitle: z.string().optional(),
    xKey: z.string().min(1),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    yFormat: valueFormatSchema.optional(),
    series: z.array(chartSeriesSchema).min(1),
    data: z.array(row).min(1).max(MAX_CHART_POINTS),
    stacked: z.boolean().optional(),
    horizontal: z.boolean().optional(),
    referenceLines: z.array(referenceLineSchema).optional(),
    allowedTypes: z.array(chartTypeSchema).optional(),
  })
  .superRefine((spec, ctx) => {
    const keys = new Set(spec.data.flatMap((r) => Object.keys(r)));
    if (!keys.has(spec.xKey)) {
      ctx.addIssue({ code: 'custom', path: ['xKey'], message: `xKey "${spec.xKey}" assente nei dati` });
    }
    spec.series.forEach((s, i) => {
      if (!keys.has(s.key)) {
        ctx.addIssue({ code: 'custom', path: ['series', i, 'key'], message: `serie "${s.key}" assente nei dati` });
      }
    });
    if (spec.type === 'pie' && spec.series.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['series'], message: 'un grafico a torta ha esattamente una serie' });
    }
    if (spec.allowedTypes && !spec.allowedTypes.includes(spec.type)) {
      ctx.addIssue({ code: 'custom', path: ['allowedTypes'], message: 'allowedTypes deve includere il tipo corrente' });
    }
  });

export const tableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  format: valueFormatSchema.optional(),
  align: z.enum(['left', 'right', 'center']).optional(),
});

export const tableSpecSchema = z
  .object({
    kind: z.literal('table'),
    id: z.string().min(1),
    title: z.string().min(1),
    columns: z.array(tableColumnSchema).min(1),
    rows: z.array(row).max(MAX_TABLE_ROWS),
    totals: row.optional(),
    defaultSort: z.object({ key: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  })
  .superRefine((spec, ctx) => {
    const columnKeys = new Set(spec.columns.map((c) => c.key));
    if (spec.defaultSort && !columnKeys.has(spec.defaultSort.key)) {
      ctx.addIssue({ code: 'custom', path: ['defaultSort', 'key'], message: 'defaultSort su colonna inesistente' });
    }
  });

export const artifactSchema = z.discriminatedUnion('kind', [chartSpecSchema, tableSpecSchema]);

export type ChartType = z.infer<typeof chartTypeSchema>;
export type ValueFormat = z.infer<typeof valueFormatSchema>;
export type ChartSeries = z.infer<typeof chartSeriesSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type TableColumn = z.infer<typeof tableColumnSchema>;
export type TableSpec = z.infer<typeof tableSpecSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
