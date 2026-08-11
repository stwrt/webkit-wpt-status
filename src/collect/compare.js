import { importArtifactReason, isTestFile } from './classify.js';

export const BUCKETS = ['identical', 'renamed', 'modified', 'missing', 'notImported'];

/** Buckets whose file lists are worth keeping; `identical` would be 70k paths of nothing. */
export const LISTED_BUCKETS = ['missing', 'modified', 'webkitExtra'];

function emptyNode() {
  return {
    upstreamFiles: 0,
    upstreamTests: 0,
    counts: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    tests: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    webkitExtra: 0,
  };
}

function finish(node) {
  node.imported =
    node.counts.identical + node.counts.renamed + node.counts.modified + node.counts.missing;
  node.inSync = node.counts.identical + node.counts.renamed;
  node.syncPercent = node.imported === 0 ? null : round1((100 * node.inSync) / node.imported);
  return node;
}

/**
 * Compare upstream WPT against WebKit's vendored copy, file by file, using git
 * blob SHAs as content identity.
 *
 * Counts are accumulated into every ancestor directory, not just the top level,
 * so a directory like css/css-grid can be examined on its own.
 *
 * @param {Map<string,string>} upstreamFiles path -> blob SHA, upstream wpt
 * @param {Map<string,string>} webkitFiles   path -> blob SHA, WebKit's copy (prefix stripped)
 * @param {{isImported(path: string): boolean, expectationFor(path: string): string}} expectations
 */
export function compareTrees(upstreamFiles, webkitFiles, expectations) {
  // WebKit renames reftest references on import, so a file can be present under a
  // different name. Indexing WebKit's content per top-level directory lets us spot
  // that: same blob, same directory, different path.
  const webkitShasByDir = new Map();
  for (const [filePath, sha] of webkitFiles) {
    const dir = filePath.slice(0, filePath.indexOf('/'));
    let shas = webkitShasByDir.get(dir);
    if (!shas) webkitShasByDir.set(dir, (shas = new Set()));
    shas.add(sha);
  }

  const nodes = new Map();
  const files = { missing: [], modified: [], webkitExtra: [] };

  /** Fold one file into every directory that contains it. */
  function record(filePath, bucket, isTest, isUpstream) {
    const parts = filePath.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/');
      let node = nodes.get(dir);
      if (!node) nodes.set(dir, (node = emptyNode()));

      if (isUpstream) {
        node.upstreamFiles++;
        if (isTest) node.upstreamTests++;
        node.counts[bucket]++;
        if (isTest) node.tests[bucket]++;
      } else {
        node.webkitExtra++;
      }
    }
  }

  for (const [filePath, sha] of upstreamFiles) {
    if (!filePath.includes('/')) continue; // root-level files (LICENSE, README, ...) aren't tests

    let bucket;
    if (!expectations.isImported(filePath)) {
      bucket = 'notImported';
    } else {
      const webkitSha = webkitFiles.get(filePath);
      if (webkitSha === sha) bucket = 'identical';
      else if (webkitSha !== undefined) bucket = 'modified';
      else if (webkitShasByDir.get(filePath.slice(0, filePath.indexOf('/')))?.has(sha))
        bucket = 'renamed';
      else bucket = 'missing';
    }

    record(filePath, bucket, isTestFile(filePath), true);
    if (bucket === 'missing' || bucket === 'modified') files[bucket].push(filePath);
  }

  // Files WebKit has that upstream doesn't, minus everything the import process
  // creates. What's left is mostly tests upstream has deleted or moved away.
  for (const filePath of webkitFiles.keys()) {
    if (upstreamFiles.has(filePath)) continue;
    if (importArtifactReason(filePath, upstreamFiles)) continue;
    record(filePath, null, false, false);
    files.webkitExtra.push(filePath);
  }

  // Sorted so the server can answer "everything under this prefix" with a binary
  // search instead of scanning ~19k paths per request.
  for (const list of Object.values(files)) list.sort();

  const tree = new Map();
  for (const [path, node] of nodes) {
    node.expectation = expectations.expectationFor(path);
    tree.set(path, finish(node));
  }

  const directories = [...tree]
    .filter(([path]) => !path.includes('/'))
    .map(([name, node]) => ({ name, ...node }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { tree, directories, files, totals: summarise(directories) };
}

function summarise(directories) {
  const totals = {
    upstreamFiles: 0,
    upstreamTests: 0,
    counts: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    tests: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    webkitExtra: 0,
    directories: directories.length,
    directoriesImported: 0,
  };

  for (const dir of directories) {
    totals.upstreamFiles += dir.upstreamFiles;
    totals.upstreamTests += dir.upstreamTests;
    totals.webkitExtra += dir.webkitExtra;
    if (dir.imported > 0) totals.directoriesImported++;
    for (const bucket of BUCKETS) {
      totals.counts[bucket] += dir.counts[bucket];
      totals.tests[bucket] += dir.tests[bucket];
    }
  }

  finish(totals);

  const importedTests =
    totals.tests.identical + totals.tests.renamed + totals.tests.modified + totals.tests.missing;
  totals.importedTests = importedTests;
  totals.testSyncPercent =
    importedTests === 0
      ? null
      : round1((100 * (totals.tests.identical + totals.tests.renamed)) / importedTests);

  return totals;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
