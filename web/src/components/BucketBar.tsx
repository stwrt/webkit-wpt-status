import type { Bucket, Counts } from '@/lib/api';
import { BUCKET_DESCRIPTIONS, BUCKET_LABELS, BUCKET_SWATCH, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The bar shows composition *within the imported scope*. Not-imported files are a
 * different question — what WebKit chose to vendor, not how current it is — and
 * would swamp directories like css, so they get their own column instead of a
 * fifth segment.
 */
export const BAR_BUCKETS: Bucket[] = ['identical', 'renamed', 'modified', 'missing'];

interface BucketBarProps {
  counts: Counts;
  className?: string;
}

export function BucketBar({ counts, className }: BucketBarProps) {
  const segments = BAR_BUCKETS.map((bucket) => ({ bucket, value: counts[bucket] })).filter(
    (segment) => segment.value > 0,
  );
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <div className={cn('bg-muted h-2 w-full rounded-full', className)} aria-hidden />;
  }

  return (
    // gap-[2px] lets the surface separate the segments; no strokes are drawn.
    <div className={cn('flex h-2 w-full gap-[2px] overflow-hidden rounded-full', className)}>
      {segments.map(({ bucket, value }) => (
        <div
          key={bucket}
          className={cn('h-full', BUCKET_SWATCH[bucket])}
          style={{ flexGrow: value, flexBasis: 0 }}
          title={`${BUCKET_LABELS[bucket]}: ${formatNumber(value)} (${formatPercent(
            Math.round((1000 * value) / total) / 10,
          )})`}
        />
      ))}
    </div>
  );
}

export function BucketLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs', className)}>
      {BAR_BUCKETS.map((bucket) => (
        <li key={bucket} className="flex items-center gap-2" title={BUCKET_DESCRIPTIONS[bucket]}>
          <span className={cn('size-2.5 shrink-0 rounded-[3px]', BUCKET_SWATCH[bucket])} aria-hidden />
          {BUCKET_LABELS[bucket]}
        </li>
      ))}
      <li className="flex items-center gap-2" title={BUCKET_DESCRIPTIONS.notImported}>
        <span className="bg-not-imported size-2.5 shrink-0 rounded-[3px]" aria-hidden />
        {BUCKET_LABELS.notImported}
        <span className="text-muted-foreground/70">(shown separately)</span>
      </li>
    </ul>
  );
}
