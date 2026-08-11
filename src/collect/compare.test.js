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

const byName = (result, name) => result.directories.find((d) => d.name === name);

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

  const { directories, totals } = compareTrees(upstream, webkit, expectations);
  const dom = byName({ directories }, 'dom');

  assert.deepEqual(dom.counts, {
    identical: 1,
    renamed: 0,
    modified: 1,
    missing: 1,
    notImported: 0,
  });
  assert.deepEqual(dom.files.missing, ['dom/gone.html']);
  assert.deepEqual(dom.files.modified, ['dom/changed.html']);

  assert.equal(byName({ directories }, 'webdriver').counts.notImported, 1);
  assert.equal(totals.counts.notImported, 1);
  assert.equal(totals.imported, 3, 'skipped files are outside the imported scope');
  assert.equal(totals.syncPercent, 33.3);
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

  const dom = byName(compareTrees(upstream, webkit, expectations), 'dom');
  assert.equal(dom.counts.renamed, 1);
  assert.equal(dom.counts.missing, 0);
  assert.equal(dom.webkitExtra, 0, 'the renamed copy is not an extra file');
  assert.equal(dom.syncPercent, 100);
});

test('a matching blob in a different directory is not treated as a rename', () => {
  const upstream = new Map([['dom/only.html', 'aaa']]);
  const webkit = new Map([['other/only.html', 'aaa']]);

  const dom = byName(compareTrees(upstream, webkit, expectations), 'dom');
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
    ['dom/deleted-upstream.html', 'old'], // the real signal
  ]);

  const dom = byName(compareTrees(upstream, webkit, expectations), 'dom');
  assert.equal(dom.webkitExtra, 1);
  assert.deepEqual(dom.files.webkitExtra, ['dom/deleted-upstream.html']);
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
  assert.equal(totals.directories, 2);
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
