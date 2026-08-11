import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronRight, Search } from 'lucide-react';

import type { Counts, Report } from '@/lib/api';
import { webkitUrl } from '@/lib/api';
import type { Metric } from '@/lib/metric';
import { metricCounts, metricScope, metricSyncPercent } from '@/lib/metric';
import { formatNumber, formatPercent } from '@/lib/format';
import { BucketBar } from '@/components/BucketBar';
import { DirectoryDetail } from '@/components/DirectoryDetail';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * One row with the chosen metric already resolved. Building the rows per metric
 * (rather than reading `metric` inside the column accessors) is what makes the
 * table update when the toggle flips — the table memoises accessor results
 * against the identity of the data array.
 */
interface Row {
  name: string;
  expectation: string;
  counts: Counts;
  scope: number;
  syncPercent: number | null;
  webkitExtra: number;
}

const EXPECTATION_LABELS: Record<string, string> = {
  import: 'imported',
  'import-no-rewrite': 'imported as-is',
  skip: 'skipped',
  'skip-new-directories': 'partial',
};

const NUMERIC_COLUMNS = new Set(['missing', 'modified', 'notImported', 'webkitExtra']);

function ExpectationBadge({ expectation }: { expectation: string }) {
  const imported = expectation.startsWith('import');
  return (
    <Badge
      variant={imported ? 'secondary' : 'outline'}
      className={cn('font-normal', !imported && 'text-muted-foreground')}
      title={`import-expectations.json: "${expectation}"`}
    >
      {EXPECTATION_LABELS[expectation] ?? expectation}
    </Badge>
  );
}

function numericColumn(
  id: string,
  header: string,
  value: (row: Row) => number,
  tooltip: string,
): ColumnDef<Row> {
  return {
    id,
    header: () => <span title={tooltip}>{header}</span>,
    accessorFn: value,
    sortDescFirst: true,
    cell: ({ getValue }) => {
      const count = getValue<number>();
      return (
        <span className={cn('tabular-nums', count === 0 && 'text-muted-foreground/50')}>
          {formatNumber(count)}
        </span>
      );
    },
  };
}

const columns: ColumnDef<Row>[] = [
  {
    id: 'name',
    header: 'Directory',
    accessorKey: 'name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight
          className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[expanded=true]:rotate-90"
          aria-hidden
        />
        <span className="font-mono text-sm">{row.original.name}</span>
      </div>
    ),
  },
  {
    id: 'expectation',
    header: 'Status',
    accessorKey: 'expectation',
    cell: ({ row }) => <ExpectationBadge expectation={row.original.expectation} />,
  },
  {
    id: 'sync',
    header: 'In sync',
    accessorFn: (row) => row.syncPercent ?? -1,
    sortDescFirst: false,
    cell: ({ row }) => {
      if (row.original.scope === 0) {
        return <span className="text-muted-foreground/50 text-sm">not imported</span>;
      }
      return (
        <div className="flex min-w-40 items-center gap-3">
          <BucketBar counts={row.original.counts} className="min-w-24 flex-1" />
          <span className="w-12 shrink-0 text-right text-sm tabular-nums">
            {formatPercent(row.original.syncPercent)}
          </span>
        </div>
      );
    },
  },
  numericColumn(
    'missing',
    'Missing',
    (row) => row.counts.missing,
    "Upstream has the file, WebKit's copy doesn't",
  ),
  numericColumn(
    'modified',
    'Modified',
    (row) => row.counts.modified,
    'Present in both but the contents differ',
  ),
  numericColumn(
    'notImported',
    'Not imported',
    (row) => row.counts.notImported,
    'import-expectations.json tells WebKit to skip these',
  ),
  numericColumn(
    'webkitExtra',
    'WebKit only',
    (row) => row.webkitExtra,
    'In WebKit but not upstream, excluding files the import process generates',
  ),
];

export function DirectoryTable({ report, metric }: { report: Report; metric: Metric }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'missing', desc: true }]);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const data = useMemo<Row[]>(
    () =>
      report.directories.map((directory) => ({
        name: directory.name,
        expectation: directory.expectation,
        counts: metricCounts(directory, metric),
        scope: metricScope(directory, metric),
        syncPercent: metricSyncPercent(directory, metric),
        webkitExtra: directory.webkitExtra,
      })),
    [report, metric],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _columnId, value: string) =>
      row.original.name.toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter directories…"
            className="pl-9"
            aria-label="Filter directories"
          />
        </div>
        <p className="text-muted-foreground text-sm">
          {formatNumber(rows.length)} of {formatNumber(report.directories.length)} top-level
          directories
        </p>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'whitespace-nowrap select-none',
                        header.column.getCanSort() && 'hover:text-foreground cursor-pointer',
                        NUMERIC_COLUMNS.has(header.id) && 'text-right',
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3" aria-hidden />}
                        {sorted === 'desc' && <ArrowDown className="size-3" aria-hidden />}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isOpen = expanded === row.original.name;
              const toggle = () => setExpanded(isOpen ? null : row.original.name);
              return [
                <TableRow
                  key={row.id}
                  data-expanded={isOpen}
                  data-state={isOpen ? 'selected' : undefined}
                  className="group focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-label={`${row.original.name} details`}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    toggle();
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn('py-2', NUMERIC_COLUMNS.has(cell.column.id) && 'text-right')}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>,
                isOpen && (
                  <TableRow key={`${row.id}-detail`} className="hover:bg-transparent">
                    <TableCell colSpan={row.getVisibleCells().length} className="bg-muted/40 p-0">
                      <DirectoryDetail
                        name={row.original.name}
                        webkitTreeUrl={webkitUrl(row.original.name)}
                        metric={metric}
                      />
                    </TableCell>
                  </TableRow>
                ),
              ];
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                  No directories match “{filter}”.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
