export type Bucket = 'identical' | 'renamed' | 'modified' | 'missing' | 'notImported';

export type Counts = Record<Bucket, number>;

export interface RepoInfo {
  name: string;
  url: string;
  ref: string;
  sha: string;
  committedAt: string;
  subject: string;
}

export interface DirectorySummary {
  name: string;
  expectation: string;
  upstreamFiles: number;
  upstreamTests: number;
  counts: Counts;
  tests: Counts;
  webkitExtra: number;
  /** Files whose import status WebKit tracks: everything except notImported. */
  imported: number;
  inSync: number;
  syncPercent: number | null;
}

export interface Totals {
  upstreamFiles: number;
  upstreamTests: number;
  counts: Counts;
  tests: Counts;
  webkitExtra: number;
  directories: number;
  directoriesImported: number;
  imported: number;
  inSync: number;
  syncPercent: number | null;
  importedTests: number;
  testSyncPercent: number | null;
}

export interface Report {
  generatedAt: string;
  durationMs: number;
  upstream: RepoInfo;
  webkit: RepoInfo & { wptPrefix: string };
  expectations: { root: string; rules: number };
  totals: Totals;
  directories: DirectorySummary[];
}

export interface FileList {
  total: number;
  truncated: boolean;
  items: string[];
}

/** A subdirectory of the directory being viewed. */
export interface DirectoryChild {
  path: string;
  name: string;
  expectation: string;
  hasChildren: boolean;
  counts: Counts;
  tests: Counts;
  webkitExtra: number;
  imported: number;
  inSync: number;
  syncPercent: number | null;
}

export interface DirectoryDetail {
  path: string;
  expectation: string;
  counts: Counts;
  tests: Counts;
  webkitExtra: number;
  imported: number;
  inSync: number;
  syncPercent: number | null;
  children: DirectoryChild[];
  lists: {
    missing: FileList;
    modified: FileList;
    webkitExtra: FileList;
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const fetchReport = () => getJson<Report>('/api/report');

/** `dirPath` may be any depth, e.g. "css/css-grid" — slashes stay as separators. */
export const fetchDirectory = (dirPath: string) =>
  getJson<DirectoryDetail>(`/api/dirs/${dirPath.split('/').map(encodeURIComponent).join('/')}`);

const UPSTREAM_BLOB = 'https://github.com/web-platform-tests/wpt/blob/master';
const WEBKIT_TREE =
  'https://github.com/WebKit/WebKit/tree/main/LayoutTests/imported/w3c/web-platform-tests';

export const upstreamUrl = (filePath: string) => `${UPSTREAM_BLOB}/${filePath}`;
export const webkitUrl = (filePath: string) => `${WEBKIT_TREE}/${filePath}`;
