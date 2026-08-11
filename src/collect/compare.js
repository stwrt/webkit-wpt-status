import { importArtifactReason, isTestFile } from './classify.js';

export const BUCKETS = ['identical', 'renamed', 'modified', 'missing', 'notImported'];

function topLevel(filePath) {
  const slash = filePath.indexOf('/');
  return slash === -1 ? filePath : filePath.slice(0, slash);
}

function emptyDirectory(name) {
  return {
    name,
    upstreamFiles: 0,
    upstreamTests: 0,
    counts: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    tests: { identical: 0, renamed: 0, modified: 0, missing: 0, notImported: 0 },
    webkitExtra: 0,
    files: { missing: [], modified: [], webkitExtra: [] },
  };
}

/**
 * Compare upstream WPT against WebKit's vendored copy, file by file, using git
 * blob SHAs as content identity.
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
    const dir = topLevel(filePath);
    let shas = webkitShasByDir.get(dir);
    if (!shas) webkitShasByDir.set(dir, (shas = new Set()));
    shas.add(sha);
  }

  const directories = new Map();
  const directoryFor = (name) => {
    let dir = directories.get(name);
    if (!dir) directories.set(name, (dir = emptyDirectory(name)));
    return dir;
  };

  for (const [filePath, sha] of upstreamFiles) {
    if (!filePath.includes('/')) continue; // root-level files (LICENSE, README, ...) aren't tests
    const dir = directoryFor(topLevel(filePath));
    const test = isTestFile(filePath);

    let bucket;
    if (!expectations.isImported(filePath)) {
      bucket = 'notImported';
    } else {
      const webkitSha = webkitFiles.get(filePath);
      if (webkitSha === sha) bucket = 'identical';
      else if (webkitSha !== undefined) bucket = 'modified';
      else if (webkitShasByDir.get(dir.name)?.has(sha)) bucket = 'renamed';
      else bucket = 'missing';
    }

    dir.upstreamFiles++;
    if (test) dir.upstreamTests++;
    dir.counts[bucket]++;
    if (test) dir.tests[bucket]++;
    if (bucket === 'missing' || bucket === 'modified') dir.files[bucket].push(filePath);
  }

  // Files WebKit has that upstream doesn't, minus everything the import process
  // creates. What's left is mostly tests upstream has deleted or moved away.
  for (const filePath of webkitFiles.keys()) {
    if (upstreamFiles.has(filePath)) continue;
    if (importArtifactReason(filePath, upstreamFiles)) continue;
    const dir = directoryFor(topLevel(filePath));
    dir.webkitExtra++;
    dir.files.webkitExtra.push(filePath);
  }

  for (const dir of directories.values()) {
    dir.expectation = expectations.expectationFor(dir.name);
    dir.imported = dir.counts.identical + dir.counts.renamed + dir.counts.modified + dir.counts.missing;
    dir.inSync = dir.counts.identical + dir.counts.renamed;
    dir.syncPercent = dir.imported === 0 ? null : round1((100 * dir.inSync) / dir.imported);
    for (const list of Object.values(dir.files)) list.sort();
  }

  return {
    directories: [...directories.values()].sort((a, b) => a.name.localeCompare(b.name)),
    totals: summarise([...directories.values()]),
  };
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

  totals.imported =
    totals.counts.identical + totals.counts.renamed + totals.counts.modified + totals.counts.missing;
  totals.inSync = totals.counts.identical + totals.counts.renamed;
  totals.syncPercent = totals.imported === 0 ? null : round1((100 * totals.inSync) / totals.imported);

  const importedTests =
    totals.tests.identical + totals.tests.renamed + totals.tests.modified + totals.tests.missing;
  totals.importedTests = importedTests;
  totals.testSyncPercent =
    importedTests === 0 ? null : round1((100 * (totals.tests.identical + totals.tests.renamed)) / importedTests);

  return totals;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
