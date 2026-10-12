import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TableSpec } from '@logisticai/shared';
import { downloadCsv, slug, toCsv } from './csv';
import { formatValue } from './format';

type Row = TableSpec['rows'][number];
const PAGE_SIZE = 20;

export function DataTable({ spec, compact = false }: { spec: TableSpec; compact?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>(
    spec.defaultSort ? [{ id: spec.defaultSort.key, desc: spec.defaultSort.direction === 'desc' }] : [],
  );
  const [filter, setFilter] = useState('');
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      spec.columns.map((c) => ({
        id: c.key,
        accessorFn: (row) => row[c.key],
        header: c.label,
        cell: (info) => formatValue(info.getValue() as Row[string], c.format),
        sortUndefined: 'last',
        meta: { align: c.align ?? (c.format && c.format !== 'string' && c.format !== 'date' ? 'right' : 'left') },
      })),
    [spec.columns],
  );
  const table = useReactTable({
    data: spec.rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });
  const paginated = table.getPrePaginationRowModel().rows.length > PAGE_SIZE;
  const alignClass = (align: string) => (align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left');

  return (
    <figure className={`${compact ? 'overflow-hidden rounded-xl border border-bordo-tenue' : 'card overflow-hidden'}`} aria-label={spec.title}>
      {!compact && (
        <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <span className="font-semibold">{spec.title}</span>
          <div className="flex items-center gap-2">
            {spec.rows.length > 8 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Cerca nella tabella"
                aria-label="Cerca nella tabella"
                className="w-48 rounded-full border border-bordo bg-fondo px-3.5 py-1.5 text-sm focus:border-primario focus:outline-none"
              />
            )}
            <button
              type="button"
              onClick={() => downloadCsv(`${slug(spec.title)}.csv`, toCsv(spec.columns, spec.rows))}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-testo-2 hover:bg-primario-chiaro hover:text-primario"
            >
              <Download size={15} aria-hidden /> Esporta CSV
            </button>
          </div>
        </figcaption>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-fondo text-testo-2">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align: string }).align;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold ${alignClass(align)}`}
                    >
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-testo">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' ? <ArrowUp size={13} aria-hidden /> : sorted === 'desc' ? <ArrowDown size={13} aria-hidden /> : <ChevronsUpDown size={13} className="opacity-50" aria-hidden />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-bordo-tenue transition-colors hover:bg-primario-chiaro/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={`px-4 py-2.5 ${alignClass((cell.column.columnDef.meta as { align: string }).align)}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {spec.totals && (
            <tfoot className="border-t-2 border-bordo bg-fondo font-semibold">
              <tr>
                {spec.columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-2.5 ${alignClass(i === 0 ? 'left' : ((columns[i].meta as { align: string }).align))}`}>
                    {formatValue(spec.totals![c.key], i === 0 ? 'string' : c.format)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {paginated && (
        <div className="flex items-center justify-end gap-2 border-t border-bordo-tenue px-4 py-2.5 text-sm text-testo-2">
          <span>
            Pagina {table.getState().pagination.pageIndex + 1} di {table.getPageCount()}
          </span>
          <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rounded-lg border border-bordo px-3 py-1 font-medium text-testo hover:border-primario hover:text-primario disabled:opacity-40">
            Precedente
          </button>
          <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rounded-lg border border-bordo px-3 py-1 font-medium text-testo hover:border-primario hover:text-primario disabled:opacity-40">
            Successiva
          </button>
        </div>
      )}
    </figure>
  );
}
