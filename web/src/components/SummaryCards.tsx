import type { Report } from '@/lib/api';
import type { Metric } from '@/lib/metric';
import { metricCounts, metricCoverage, metricScope, metricSyncPercent } from '@/lib/metric';
import { formatNumber, formatPercent, formatRelative } from '@/lib/format';
import { BucketBar, BucketLegend } from '@/components/BucketBar';
import { Card, CardContent } from '@/components/ui/card';

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ report, metric }: { report: Report; metric: Metric }) {
  const { totals } = report;
  const counts = metricCounts(totals, metric);
  const scope = metricScope(totals, metric);
  const noun = metric === 'tests' ? 'tests' : 'files';

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardContent className="flex h-full flex-col justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs">Upstream {noun} WebKit has</p>
            {/* The one hero figure on the page. */}
            <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
              {formatPercent(metricCoverage(totals, metric))}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {formatNumber(counts.identical + counts.renamed + counts.modified)} of{' '}
              {formatNumber(scope)} {noun} WebKit imports exist in its tree.
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {formatPercent(metricSyncPercent(totals, metric))} are byte-for-byte identical to
              upstream. The rest are there but differ, usually by only a line or two.
            </p>
          </div>
          <div className="space-y-3">
            <BucketBar counts={counts} className="h-2.5" />
            <BucketLegend />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-rows-2">
        <StatTile
          label={`Missing ${noun}`}
          value={formatNumber(counts.missing)}
          detail={`Upstream has them; WebKit's copy doesn't`}
        />
        <StatTile
          label={`Not resynced ${noun}`}
          value={formatNumber(counts.modified)}
          detail="Present in both, usually a line or two apart"
        />
        <StatTile
          label="Directories imported"
          value={`${formatNumber(totals.directoriesImported)} / ${formatNumber(totals.directories)}`}
          detail={`${formatNumber(
            totals.directories - totals.directoriesImported,
          )} upstream directories are skipped entirely`}
        />
        <StatTile
          label="Last checked"
          value={formatRelative(report.generatedAt)}
          detail={`Collected in ${(report.durationMs / 1000).toFixed(1)}s`}
        />
      </div>
    </section>
  );
}
