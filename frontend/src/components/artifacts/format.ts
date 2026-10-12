import type { ValueFormat } from '@logisticai/shared';

type Cell = string | number | null | undefined;

// In it-IT i numeri a 4 cifre non vengono raggruppati di default: forziamo il separatore.
const grouping = { useGrouping: 'always' } as const;

const formatters = {
  number: new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2, ...grouping }),
  integer: new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, ...grouping }),
  percent: new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1, ...grouping }),
  currency: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', ...grouping }),
  // Sotto il centesimo (es. costo di una chiamata AI) servono più decimali, altrimenti si legge "0,00 €".
  smallCurrency: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 2 }),
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function formatDate(value: string): string {
  if (!ISO_DATE.test(value)) return value;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatValue(value: Cell, format?: ValueFormat): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') {
    return format === 'date' ? formatDate(value) : value;
  }
  switch (format) {
    case 'integer':
      return formatters.integer.format(value);
    case 'percent':
      return formatters.percent.format(value);
    case 'currency_eur':
      return value !== 0 && Math.abs(value) < 0.01 ? formatters.smallCurrency.format(value) : formatters.currency.format(value);
    case 'duration_min':
      return formatDuration(value);
    case 'string':
      return String(value);
    default:
      return formatters.number.format(value);
  }
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Etichetta compatta per l'asse X: "2026-09" diventa "set 2026"; con `monthly` anche "2026-09-01". */
export function formatCategory(value: string | number | null | undefined, monthly = false): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatValue(value);
  const month = (monthly ? /^(\d{4})-(\d{2})(?:-01)?$/ : /^(\d{4})-(\d{2})$/).exec(value);
  if (month) return `${MESI[Number(month[2]) - 1]} ${month[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatValue(value, 'date');
  return value;
}

/** Vero se tutte le categorie sono il primo giorno di un mese (serie mensile). */
export const isMonthlySeries = (values: unknown[]) =>
  values.length > 0 && values.every((v) => typeof v === 'string' && /^\d{4}-\d{2}(-01)?$/.test(v));
