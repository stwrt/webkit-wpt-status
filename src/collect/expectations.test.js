import test from 'node:test';
import assert from 'node:assert/strict';

import { parseImportExpectations } from './expectations.js';

const FIXTURE = {
  'web-platform-tests': 'skip-new-directories',
  'web-platform-tests/.github': 'skip',
  'web-platform-tests/FileAPI': 'import',
  'web-platform-tests/css': 'skip-new-directories',
  'web-platform-tests/css/css-flexbox': 'import',
  'web-platform-tests/css/css-flexbox/tentative': 'skip',
  'web-platform-tests/encoding': 'import-no-rewrite',
  'web-platform-tests/webdriver': 'skip',
};

test('the most specific prefix wins', () => {
  const { expectationFor } = parseImportExpectations(FIXTURE);
  assert.equal(expectationFor('css/css-flexbox/order-001.html'), 'import');
  assert.equal(expectationFor('css/css-flexbox/tentative/wip.html'), 'skip');
  assert.equal(expectationFor('css/css-grid/grid-001.html'), 'skip-new-directories');
  assert.equal(expectationFor('FileAPI/blob/Blob-slice.any.js'), 'import');
});

test('unlisted directories fall back to the root rule', () => {
  const { expectationFor, root } = parseImportExpectations(FIXTURE);
  assert.equal(root, 'skip-new-directories');
  // Upstream directories WebKit has never triaged (ai, fedcm, third_party, ...).
  assert.equal(expectationFor('third_party/whatever/file.js'), 'skip-new-directories');
  assert.equal(expectationFor('ai/prompt-api.html'), 'skip-new-directories');
});

test('only import* counts as imported', () => {
  const { isImported } = parseImportExpectations(FIXTURE);
  assert.equal(isImported('FileAPI/blob.any.js'), true);
  assert.equal(isImported('encoding/api-basics.html'), true, 'import-no-rewrite is still imported');
  assert.equal(isImported('webdriver/tests/x.py'), false);
  assert.equal(isImported('.github/workflows/ci.yml'), false);
  assert.equal(isImported('css/css-grid/grid-001.html'), false, 'skip-new-directories is not imported');
});

test('a prefix rule does not leak across sibling names', () => {
  const { expectationFor } = parseImportExpectations({
    'web-platform-tests': 'skip',
    'web-platform-tests/css': 'import',
  });
  // "cssom" must not inherit the rule for "css".
  assert.equal(expectationFor('cssom/some-test.html'), 'skip');
  assert.equal(expectationFor('css/some-test.html'), 'import');
});

test('keys outside the web-platform-tests namespace are ignored', () => {
  const { rules } = parseImportExpectations({
    'web-platform-tests': 'skip',
    'web-platform-tests-extra/foo': 'import',
  });
  assert.deepEqual([...rules.keys()], ['']);
});

test('accepts the file as raw JSON text', () => {
  const { expectationFor } = parseImportExpectations(JSON.stringify(FIXTURE));
  assert.equal(expectationFor('FileAPI/x.html'), 'import');
});
