import fs from 'node:fs/promises';
import path from 'node:path';

import {
  dataDir,
  IMPORT_EXPECTATIONS_PATH,
  MAX_FILES_PER_BUCKET,
  UPSTREAM,
  WEBKIT,
  WEBKIT_WPT_PREFIX,
} from './config.js';
import { listTree, readFile, syncRepo } from './repos.js';
import { parseImportExpectations } from './expectations.js';
import { compareTrees } from './compare.js';

function log(message) {
  process.stderr.write(`[collect] ${message}\n`);
}

/** Directory names come from git and are used as filenames; keep them boring. */
function isSafeDirName(name) {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

function capped(list) {
  return {
    total: list.length,
    truncated: list.length > MAX_FILES_PER_BUCKET,
    items: list.slice(0, MAX_FILES_PER_BUCKET),
  };
}

export async function collect() {
  const started = Date.now();

  const [upstream, webkit] = await Promise.all([syncRepo(UPSTREAM, log), syncRepo(WEBKIT, log)]);

  const [upstreamFiles, webkitFiles, expectationsJson] = await Promise.all([
    listTree(upstream),
    listTree(webkit, WEBKIT_WPT_PREFIX),
    readFile(webkit, IMPORT_EXPECTATIONS_PATH),
  ]);
  log(`upstream files: ${upstreamFiles.size}, WebKit files: ${webkitFiles.size}`);

  const expectations = parseImportExpectations(expectationsJson);
  const { directories, totals } = compareTrees(upstreamFiles, webkitFiles, expectations);
  log(
    `${totals.imported} files in scope, ${totals.syncPercent}% in sync, ` +
      `${totals.counts.missing} missing, ${totals.counts.modified} modified`,
  );

  const meta = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    upstream: pickRepo(upstream),
    webkit: { ...pickRepo(webkit), wptPrefix: WEBKIT_WPT_PREFIX },
    expectations: { root: expectations.root, rules: expectations.rules.size },
  };

  const report = {
    ...meta,
    totals,
    directories: directories.map(({ files, ...dir }) => ({
      ...dir,
      hasDetail: isSafeDirName(dir.name),
    })),
  };

  await fs.rm(path.join(dataDir, 'dirs'), { recursive: true, force: true });
  await fs.mkdir(path.join(dataDir, 'dirs'), { recursive: true });

  await Promise.all(
    directories.filter((dir) => isSafeDirName(dir.name)).map((dir) =>
      writeJson(path.join(dataDir, 'dirs', `${dir.name}.json`), {
        name: dir.name,
        expectation: dir.expectation,
        counts: dir.counts,
        missing: capped(dir.files.missing),
        modified: capped(dir.files.modified),
        webkitExtra: capped(dir.files.webkitExtra),
      }),
    ),
  );

  await writeJson(path.join(dataDir, 'report.json'), report);
  await writeJson(path.join(dataDir, 'meta.json'), meta);

  log(`wrote data/ in ${Date.now() - started}ms`);
  return report;
}

function pickRepo({ name, url, ref, sha, committedAt, subject }) {
  return { name, url, ref, sha, committedAt, subject };
}

/** Write via a temp file so a reader never sees a half-written report. */
async function writeJson(filePath, value) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, filePath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  collect().catch((error) => {
    log(`failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
