import test from 'node:test';
import assert from 'node:assert/strict';

import { compareTrees } from './compare.js';
import { parseImportExpectations } from './expectations.js';
import { importArtifactReason, isTestFile } from './classify.js';

const expectations = parseImportExpectations({
  'web-platform-tests': 'skip-new-directories',
  'web-platform-tests/dom': 'import',
  'web-platform-tests/webdriver': 'skip',
});

test('buckets files by content identity', () => {
  const upstream = new Map([
    ['dom/same.html', 'aaa'],
    ['dom/changed.html', 'bbb'],
    ['dom/gone.html', 'ccc'],
    ['webdriver/skipped.html', 'ddd'],
  ]);
  const webkit = new Map([
    ['dom/same.html', 'aaa'],
    ['dom/changed.html', 'bbb-webkit'],
  ]);

  const { tree, files, totals } = compareTrees(upstream, webkit, expectations);

  assert.deepEqual(tree.get('dom').counts, {
    identical: 1,
    renamed: 0,
    modified: 1,
    missing: 1,
    notImported: 0,
  });
  assert.deepEqual(files.missing, ['dom/gone.html']);
  assert.deepEqual(files.modified, ['dom/changed.html']);

  assert.equal(tree.get('webdriver').counts.notImported, 1);
  assert.equal(totals.counts.notImported, 1);
  assert.equal(totals.imported, 3, 'skipped files are outside the imported scope');
  assert.equal(totals.syncPercent, 33.3);
});

test('counts roll up into every ancestor directory', () => {
  const upstream = new Map([
    ['dom/nodes/a.html', 'aaa'],
    ['dom/nodes/deep/b.html', 'bbb'],
    ['dom/events/c.html', 'ccc'],
  ]);
  const webkit = new Map([['dom/nodes/a.html', 'aaa']]);

  const { tree } = compareTrees(upstream, webkit, expectations);

  assert.deepEqual([...tree.keys()].sort(), [
    'dom',
    'dom/events',
    'dom/nodes',
    'dom/nodes/deep',
  ]);
  assert.equal(tree.get('dom').upstreamFiles, 3);
  assert.equal(tree.get('dom').counts.missing, 2);
  assert.equal(tree.get('dom/nodes').counts.identical, 1);
  assert.equal(tree.get('dom/nodes').counts.missing, 1, 'includes the nested deep/ file');
  assert.equal(tree.get('dom/nodes/deep').counts.missing, 1);
  assert.equal(tree.get('dom/events').counts.missing, 1);
  assert.equal(tree.get('dom/nodes').syncPercent, 50);
});

test('every directory carries its own resolved expectation', () => {
  const nested = parseImportExpectations({
    'web-platform-tests': 'skip-new-directories',
    'web-platform-tests/css': 'skip-new-directories',
    'web-platform-tests/css/css-grid': 'import',
  });
  const upstream = new Map([
    ['css/css-grid/a.html', 'aaa'],
    ['css/css-fonts/b.html', 'bbb'],
  ]);

  const { tree } = compareTrees(upstream, new Map(), nested);
  assert.equal(tree.get('css/css-grid').expectation, 'import');
  assert.equal(tree.get('css/css-fonts').expectation, 'skip-new-directories');
  assert.equal(tree.get('css/css-grid').counts.missing, 1);
  assert.equal(tree.get('css/css-fonts').counts.notImported, 1);
});

test('recognises a reference file WebKit renamed on import', () => {
  const upstream = new Map([
    ['dom/test.html', 'aaa'],
    ['dom/test-ref.html', 'bbb'],
  ]);
  const webkit = new Map([
    ['dom/test.html', 'aaa'],
    // Same content as test-ref.html, renamed so WebKit's runner picks it up.
    ['dom/test-expected.html', 'bbb'],
  ]);

  const { tree } = compareTrees(upstream, webkit, expectations);
  const dom = tree.get('dom');
  assert.equal(dom.counts.renamed, 1);
  assert.equal(dom.counts.missing, 0);
  assert.equal(dom.webkitExtra, 0, 'the renamed copy is not an extra file');
  assert.equal(dom.syncPercent, 100);
});

test('a matching blob in a different directory is not treated as a rename', () => {
  const upstream = new Map([['dom/only.html', 'aaa']]);
  const webkit = new Map([['other/only.html', 'aaa']]);

  const dom = compareTrees(upstream, webkit, expectations).tree.get('dom');
  assert.equal(dom.counts.missing, 1);
  assert.equal(dom.counts.renamed, 0);
});

test('separates import artifacts from genuine WebKit-only files', () => {
  const upstream = new Map([['dom/api.any.js', 'aaa']]);
  const webkit = new Map([
    ['dom/api.any.js', 'aaa'],
    ['dom/api.any.html', 'gen1'], // generated from api.any.js
    ['dom/api.any.worker.html', 'gen2'], // ditto
    ['dom/api-expected.txt', 'base'], // WebKit baseline
    ['dom/w3c-import.log', 'meta'], // import metadata
    ['dom/sub/deleted-upstream.html', 'old'], // the real signal
  ]);

  const { tree, files } = compareTrees(upstream, webkit, expectations);
  assert.equal(tree.get('dom').webkitExtra, 1);
  assert.equal(tree.get('dom/sub').webkitExtra, 1, 'extras roll up too');
  assert.deepEqual(files.webkitExtra, ['dom/sub/deleted-upstream.html']);
});

test('file lists come back sorted, for prefix lookups', () => {
  const upstream = new Map([
    ['dom/z.html', 'a'],
    ['dom/a.html', 'b'],
    ['dom/m/n.html', 'c'],
  ]);
  const { files } = compareTrees(upstream, new Map(), expectations);
  assert.deepEqual(files.missing, ['dom/a.html', 'dom/m/n.html', 'dom/z.html']);
});

test('root-level upstream files are ignored', () => {
  const upstream = new Map([
    ['LICENSE.md', 'aaa'],
    ['dom/test.html', 'bbb'],
  ]);
  const { directories } = compareTrees(upstream, new Map(), expectations);
  assert.deepEqual(
    directories.map((d) => d.name),
    ['dom'],
  );
});

test('totals count directories with anything in scope as imported', () => {
  const upstream = new Map([
    ['dom/test.html', 'aaa'],
    ['webdriver/skipped.html', 'bbb'],
  ]);
  const { totals } = compareTrees(upstream, new Map(), expectations);
  assert.equal(totals.directories, 2, 'top-level directories only');
  assert.equal(totals.directoriesImported, 1);
});

test('import artifact detection', () => {
  const upstream = new Map([['dom/api.any.js', 'x']]);
  assert.equal(importArtifactReason('dom/w3c-import.log', upstream), 'import-metadata');
  assert.equal(importArtifactReason('dom/test-expected.txt', upstream), 'webkit-baseline');
  assert.equal(importArtifactReason('dom/test-expected.html', upstream), 'renamed-reference');
  assert.equal(importArtifactReason('dom/api.any.worker.html', upstream), 'generated-variant');
  // No .any.js source upstream, so this is not something the import generated.
  assert.equal(importArtifactReason('dom/orphan.any.html', new Map()), null);
  assert.equal(importArtifactReason('dom/plain.html', upstream), null);
});

test('test-file heuristic', () => {
  assert.equal(isTestFile('dom/nodes/Node-appendChild.html'), true);
  assert.equal(isTestFile('dom/historical.any.js'), true);
  assert.equal(isTestFile('css/CSS2/floats/float-001.xht'), true);
  assert.equal(isTestFile('dom/nodes/Node-appendChild-ref.html'), false);
  assert.equal(isTestFile('dom/nodes/Node-appendChild-expected.txt'), false);
  assert.equal(isTestFile('dom/support/helper.js'), false);
  assert.equal(isTestFile('dom/resources/thing.html'), false);
  assert.equal(isTestFile('dom/README.md'), false);
  assert.equal(isTestFile('dom/testharness-helper.js'), false);
});
