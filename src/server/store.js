import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { dataDir } from '../collect/config.js';

const gzip = promisify(zlib.gzip);

/** A JSON body prepared once and served many times: raw bytes, gzip and an ETag. */
async function prepare(value) {
  const body = Buffer.from(JSON.stringify(value));
  return {
    body,
    gzipped: await gzip(body, { level: zlib.constants.Z_BEST_COMPRESSION }),
    etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"`,
  };
}

/**
 * Holds the current snapshot in memory. A refresh only swaps it in once it has
 * loaded cleanly, so a failed collection keeps serving the last good data.
 */
export class Store {
  #report = null;
  #details = new Map();

  get report() {
    return this.#report;
  }

  get generatedAt() {
    return this.#report?.value.generatedAt ?? null;
  }

  /** Directory names come from the report, so /api/dirs/:name can't reach outside data/dirs. */
  #isKnownDirectory(name) {
    return this.#report?.value.directories.some((dir) => dir.name === name && dir.hasDetail) ?? false;
  }

  async load() {
    const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'report.json'), 'utf8'));
    this.#report = { ...(await prepare(raw)), value: raw };
    this.#details.clear();
    return raw;
  }

  async detail(name) {
    if (!this.#isKnownDirectory(name)) return null;

    let cached = this.#details.get(name);
    if (!cached) {
      const raw = await fs.readFile(path.join(dataDir, 'dirs', `${name}.json`), 'utf8');
      cached = await prepare(JSON.parse(raw));
      this.#details.set(name, cached);
    }
    return cached;
  }
}
