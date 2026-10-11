import type { ValueFormat } from '@logisticai/shared';

type Cell = string | number | null | undefined;

/** CSV per Excel in italiano: separatore ";" e virgola decimale, con BOM UTF-8. */
export function toCsv(columns: { key: string; label: string; format?: ValueFormat }[], rows: Record<string, Cell>[]): string {
  const escape = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const text = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.label)).join(';'), ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(';'))];
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const slug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'dati';
