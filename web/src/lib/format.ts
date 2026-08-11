import type { Bucket } from './api';

const numberFormat = new Intl.NumberFormat('en-US');

export const formatNumber = (value: number) => numberFormat.format(value);

export function formatPercent(value: number | null) {
  if (value === null) return '—';
  return `${value % 1 === 0 ? value : value.toFixed(1)}%`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Infinity],
];

const relativeFormat = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export function formatRelative(isoDate: string) {
  let delta = (Date.parse(isoDate) - Date.now()) / 1000;
  for (const [unit, step] of RELATIVE_UNITS) {
    if (Math.abs(delta) < step) return relativeFormat.format(Math.round(delta), unit);
    delta /= step;
  }
  return isoDate;
}

export function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export const BUCKET_ORDER: Bucket[] = ['identical', 'renamed', 'modified', 'missing', 'notImported'];

export const BUCKET_LABELS: Record<Bucket, string> = {
  identical: 'Identical',
  renamed: 'Renamed',
  modified: 'Not resynced',
  missing: 'Missing',
  notImported: 'Not imported',
};

export const BUCKET_DESCRIPTIONS: Record<Bucket, string> = {
  identical: 'Byte-for-byte the same file in both repositories.',
  renamed: "Same content under a different name — WebKit renames reftest references on import.",
  modified:
    'Present in both but the contents differ — most often by a line or two, because upstream edited the file and WebKit has not resynced.',
  missing: "Upstream has this file and WebKit's copy does not.",
  notImported: 'import-expectations.json tells WebKit to skip this path.',
};

/** Tailwind classes per bucket, driven by the tokens in index.css. */
export const BUCKET_SWATCH: Record<Bucket, string> = {
  identical: 'bg-identical',
  renamed: 'bg-renamed',
  modified: 'bg-modified',
  missing: 'bg-missing',
  notImported: 'bg-not-imported',
};
