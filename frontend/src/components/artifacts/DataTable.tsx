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
    <figure className="overflow-hidden rounded-md border border-bordo bg-carta" aria-label={spec.title}>
      {!compact && (
        <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-bordo px-4 py-3">
          <span className="font-semibold">{spec.title}</span>
          <div className="flex items-center gap-2">
            {spec.rows.length > 8 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Cerca nella tabella"
                aria-label="Cerca nella tabella"
                className="w-44 rounded border border-bordo px-2 py-1 text-sm"
              />
            )}
            <button
              type="button"
              onClick={() => downloadCsv(`${slug(spec.title)}.csv`, toCsv(spec.columns, spec.rows))}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-container hover:bg-container-chiaro"
            >
              <Download size={15} aria-hidden /> Esporta CSV
            </button>
          </div>
        </figcaption>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-cemento">
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
                      className={`whitespace-nowrap px-3 py-2 font-semibold ${alignClass(align)}`}
                    >
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' ? <ArrowUp size={13} aria-hidden /> : sorted === 'desc' ? <ArrowDown size={13} aria-hidden /> : <ChevronsUpDown size={13} className="text-ardesia" aria-hidden />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-bordo/70">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={`px-3 py-2 ${alignClass((cell.column.columnDef.meta as { align: string }).align)}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {spec.totals && (
            <tfoot className="border-t-2 border-inchiostro font-semibold">
              <tr>
                {spec.columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-2 ${alignClass(i === 0 ? 'left' : ((columns[i].meta as { align: string }).align))}`}>
                    {formatValue(spec.totals![c.key], i === 0 ? 'string' : c.format)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {paginated && (
        <div className="flex items-center justify-end gap-3 border-t border-bordo px-4 py-2 text-sm">
          <span>
            Pagina {table.getState().pagination.pageIndex + 1} di {table.getPageCount()}
          </span>
          <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rounded px-2 py-1 disabled:opacity-40">
            Precedente
          </button>
          <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rounded px-2 py-1 disabled:opacity-40">
            Successiva
          </button>
        </div>
      )}
    </figure>
  );
}
