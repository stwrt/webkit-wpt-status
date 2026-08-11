import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { dataDir } from '../collect/config.js';

const gzip = promisify(zlib.gzip);

/** Per-bucket cap on the file lists returned for one directory. */
const MAX_FILES_PER_BUCKET = 2000;

const BUCKET_KEYS = ['identical', 'renamed', 'modified', 'missing', 'notImported'];
const LISTED_BUCKETS = ['missing', 'modified', 'webkitExtra'];

/** A JSON body prepared once and served many times: raw bytes, gzip and an ETag. */
async function prepare(value) {
  const body = Buffer.from(JSON.stringify(value));
  return {
    body,
    gzipped: await gzip(body, { level: zlib.constants.Z_BEST_COMPRESSION }),
    etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"`,
  };
}

function readJson(name) {
  return fs.readFile(path.join(dataDir, name), 'utf8').then(JSON.parse);
}

/** Index of the first element that is >= value, over a sorted array. */
function lowerBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Every path under `prefix/`, taken from a sorted array. Sorted order makes the
 * matches contiguous, so this is two binary searches rather than a scan of all
 * ~19k paths on every request.
 */
function underPrefix(sorted, prefix) {
  const start = `${prefix}/`;
  const from = lowerBound(sorted, start);
  let to = from;
  while (to < sorted.length && sorted[to].startsWith(start)) to++;
  return { from, to };
}

function unpack(counts) {
  const node = { counts: {}, tests: {} };
  BUCKET_KEYS.forEach((bucket, index) => {
    node.counts[bucket] = counts[index];
    node.tests[bucket] = counts[index + 5];
  });
  node.webkitExtra = counts[10];
  node.imported =
    node.counts.identical + node.counts.renamed + node.counts.modified + node.counts.missing;
  node.inSync = node.counts.identical + node.counts.renamed;
  node.syncPercent =
    node.imported === 0 ? null : Math.round((1000 * node.inSync) / node.imported) / 10;
  return node;
}

/**
 * Holds the current snapshot in memory. A refresh only swaps it in once it has
 * loaded cleanly, so a failed collection keeps serving the last good data.
 */
export class Store {
  #report = null;
  #tree = null;
  #files = null;
  #children = null;
  #details = new Map();

  get report() {
    return this.#report;
  }

  get generatedAt() {
    return this.#report?.value.generatedAt ?? null;
  }

  async load() {
    const [report, tree, files] = await Promise.all([
      readJson('report.json'),
      readJson('tree.json'),
      readJson('files.json'),
    ]);

    // Directory paths come straight from the URL, so this object is looked up with
    // attacker-controlled keys. Without this, /api/dirs/__proto__ (or constructor,
    // or toString) would find something on Object.prototype and answer 200.
    Object.setPrototypeOf(tree.counts, null);

    // One pass to learn each directory's immediate subdirectories; the tree file
    // only knows paths.
    const children = new Map();
    for (const dirPath of Object.keys(tree.counts)) {
      const cut = dirPath.lastIndexOf('/');
      if (cut === -1) continue;
      const parent = dirPath.slice(0, cut);
      let siblings = children.get(parent);
      if (!siblings) children.set(parent, (siblings = []));
      siblings.push(dirPath);
    }

    this.#report = { ...(await prepare(report)), value: report };
    this.#tree = tree;
    this.#files = files;
    this.#children = children;
    this.#details.clear();
    return report;
  }

  /**
   * One directory at any depth: its own totals, its immediate subdirectories, and
   * every listed file beneath it.
   */
  async detail(dirPath) {
    const counts = this.#tree?.counts[dirPath];
    if (!counts) return null;

    let cached = this.#details.get(dirPath);
    if (cached) return cached;

    const node = unpack(counts);
    const children = (this.#children.get(dirPath) ?? [])
      .map((childPath) => ({
        path: childPath,
        name: childPath.slice(dirPath.length + 1),
        expectation: this.#tree.expectationLegend[this.#tree.counts[childPath][11]],
        hasChildren: this.#children.has(childPath),
        ...unpack(this.#tree.counts[childPath]),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Nested under `lists` because `webkitExtra` is already a count on the node.
    const lists = {};
    for (const bucket of LISTED_BUCKETS) {
      const sorted = this.#files[bucket];
      const { from, to } = underPrefix(sorted, dirPath);
      lists[bucket] = {
        total: to - from,
        truncated: to - from > MAX_FILES_PER_BUCKET,
        items: sorted.slice(from, Math.min(to, from + MAX_FILES_PER_BUCKET)),
      };
    }

    const detail = {
      path: dirPath,
      expectation: this.#tree.expectationLegend[counts[11]],
      ...node,
      children,
      lists,
    };

    cached = await prepare(detail);
    // Bounded so a crawler walking all ~6,700 directories can't grow this forever.
    if (this.#details.size > 256) this.#details.clear();
    this.#details.set(dirPath, cached);
    return cached;
  }
}
