import fs from 'node:fs/promises';
import path from 'node:path';

import {
  dataDir,
  IMPORT_EXPECTATIONS_PATH,
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

/**
 * Directory counts, flattened to arrays. There are ~6,700 directories across every
 * depth, and object keys repeated 6,700 times cost far more than the numbers do.
 */
function packTree(tree) {
  const legend = [];
  const counts = {};

  for (const [dirPath, node] of tree) {
    let expectation = legend.indexOf(node.expectation);
    if (expectation === -1) expectation = legend.push(node.expectation) - 1;

    counts[dirPath] = [
      node.counts.identical,
      node.counts.renamed,
      node.counts.modified,
      node.counts.missing,
      node.counts.notImported,
      node.tests.identical,
      node.tests.renamed,
      node.tests.modified,
      node.tests.missing,
      node.tests.notImported,
      node.webkitExtra,
      expectation,
    ];
  }

  return { expectationLegend: legend, counts };
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
  const { tree, directories, files, totals } = compareTrees(upstreamFiles, webkitFiles, expectations);
  log(
    `${totals.imported} files in scope, ${totals.syncPercent}% in sync, ` +
      `${totals.counts.missing} missing, ${totals.counts.modified} modified, ` +
      `${tree.size} directories`,
  );

  const meta = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    upstream: pickRepo(upstream),
    webkit: { ...pickRepo(webkit), wptPrefix: WEBKIT_WPT_PREFIX },
    expectations: { root: expectations.root, rules: expectations.rules.size },
  };

  await fs.mkdir(dataDir, { recursive: true });
  // dirs/ was the old per-top-level-directory layout, replaced by tree + files.
  await fs.rm(path.join(dataDir, 'dirs'), { recursive: true, force: true });

  await writeJson(path.join(dataDir, 'report.json'), { ...meta, totals, directories });
  await writeJson(path.join(dataDir, 'tree.json'), {
    generatedAt: meta.generatedAt,
    ...packTree(tree),
  });
  await writeJson(path.join(dataDir, 'files.json'), { generatedAt: meta.generatedAt, ...files });
  await writeJson(path.join(dataDir, 'meta.json'), meta);

  log(`wrote data/ in ${Date.now() - started}ms`);
  return { meta, totals };
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
