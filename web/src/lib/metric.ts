import type { Counts } from './api';

/**
 * Everything is counted twice: once over every file in the tree, once over just
 * the files that look like tests. Files is the exact number; tests is the one
 * people actually care about.
 */
export type Metric = 'files' | 'tests';

export const metricCounts = (row: { counts: Counts; tests: Counts }, metric: Metric): Counts =>
  metric === 'tests' ? row.tests : row.counts;

/** Total within WebKit's import scope — everything except not-imported. */
export function metricScope(row: { counts: Counts; tests: Counts }, metric: Metric): number {
  const counts = metricCounts(row, metric);
  return counts.identical + counts.renamed + counts.modified + counts.missing;
}

export function metricSyncPercent(
  row: { counts: Counts; tests: Counts },
  metric: Metric,
): number | null {
  const counts = metricCounts(row, metric);
  const scope = metricScope(row, metric);
  if (scope === 0) return null;
  return Math.round((1000 * (counts.identical + counts.renamed)) / scope) / 10;
}
