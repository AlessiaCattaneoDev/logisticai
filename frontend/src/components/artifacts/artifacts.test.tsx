import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChartSpec, TableSpec } from '@logisticai/shared';
import { ArtifactRenderer } from './ArtifactRenderer';
import * as csv from './csv';
import { chartAsTable, DataChart } from './DataChart';
import { DataTable } from './DataTable';

const fixture = <T,>(name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../shared/contracts/fixtures/valid', name), 'utf8')) as T;
const lineSla = fixture<ChartSpec>('chart_line_sla.json');
const stacked = fixture<ChartSpec>('chart_bar_stacked.json');
const margini = fixture<TableSpec>('table_margini.json');
const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');

describe('DataTable', () => {
  it('formatta i valori per colonna e mostra i totali', () => {
    render(<DataTable spec={margini} />);
    const table = screen.getByRole('table');
    expect(norm(within(table).getByText(/7\.298,00/).textContent)).toBe('7.298,00 €');
    expect(norm(within(table).getByText('-7%').textContent)).toBe('-7%');
    const footer = table.querySelector('tfoot')!;
    expect(norm(footer.textContent)).toContain('Totale');
    expect(norm(footer.textContent)).toContain('16.748,50 €');
  });

  it('ordinamento iniziale da defaultSort e cambio al click', async () => {
    render(<DataTable spec={margini} />);
    const firstCell = () => screen.getAllByRole('row')[1].querySelector('td')!.textContent;
    expect(firstCell()).toBe('CasaViva Arredo'); // margine crescente
    const header = screen.getByRole('columnheader', { name: /Margine %/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(within(header).getByRole('button'));
    expect(firstCell()).toBe('ModaNova');
  });

  it('paginazione oltre 20 righe e ricerca', async () => {
    const big: TableSpec = { ...margini, totals: undefined, defaultSort: undefined, rows: Array.from({ length: 45 }, (_, i) => ({ cliente: `Cliente ${i}`, spedizioni: i, ricavo: i * 10, margine_pct: 0.1 })) };
    render(<DataTable spec={big} />);
    expect(screen.getByText('Pagina 1 di 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Successiva' }));
    expect(screen.getByText('Pagina 2 di 3')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Cerca nella tabella' }), 'Cliente 44');
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('esporta CSV con nome file dal titolo', async () => {
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
    render(<DataTable spec={margini} />);
    await userEvent.click(screen.getByRole('button', { name: /Esporta CSV/ }));
    expect(spy).toHaveBeenCalledWith('margine-per-cliente-2026.csv', expect.stringContaining('Cliente;Spedizioni'));
  });
});

describe('DataChart', () => {
  it('titolo, sottotitolo e scelta del tipo tra quelli ammessi', async () => {
    render(<DataChart spec={lineSla} initialDimension={{ width: 600, height: 320 }} />);
    expect(screen.getByText(lineSla.title)).toBeInTheDocument();
    expect(screen.getByText(lineSla.subtitle!)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Tipo di grafico' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Linee', 'Barre', 'Aree']);
    expect(within(group).getByRole('button', { name: 'Linee' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Barre' }));
    expect(within(group).getByRole('button', { name: 'Barre' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Vedi dati" mostra la tabella con gli stessi valori', async () => {
    render(<DataChart spec={lineSla} initialDimension={{ width: 600, height: 320 }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vedi dati' }));
    expect(norm(screen.getByRole('table').textContent)).toContain('94,1%');
    await userEvent.click(screen.getByRole('button', { name: 'Vedi grafico' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('legenda: nascondi e mostra le serie', async () => {
    render(<DataChart spec={stacked} initialDimension={{ width: 600, height: 320 }} />);
    const legend = screen.getByRole('list', { name: 'Serie del grafico' });
    const btn = within(legend).getByRole('button', { name: 'Picco volumi hub' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('schermo intero apre una finestra di dialogo che si chiude con Esc', async () => {
    render(<DataChart spec={lineSla} initialDimension={{ width: 600, height: 320 }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Schermo intero' }));
    expect(screen.getByRole('dialog', { name: lineSla.title })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('chartAsTable: colonne asse X + serie, formato dell’asse Y', () => {
    const t = chartAsTable(lineSla);
    expect(t.columns.map((c) => c.key)).toEqual(['settimana', 'puntualita']);
    expect(t.columns[1].format).toBe('percent');
    expect(t.rows).toBe(lineSla.data);
  });
});

describe('ArtifactRenderer', () => {
  it('sceglie il componente in base a kind', () => {
    const { rerender } = render(<ArtifactRenderer artifact={margini} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    rerender(<ArtifactRenderer artifact={lineSla} />);
    expect(screen.getByRole('toolbar', { name: 'Opzioni del grafico' })).toBeInTheDocument();
  });
});
