/**
 * Heuristics for reading a WebKit-side file listing.
 *
 * WebKit's import script does not copy upstream verbatim: it renames reftest
 * references, materialises files that wptserve generates on the fly, and drops in
 * its own baselines. Those extra files are artifacts of importing, not drift, so
 * they have to be recognised before "WebKit has a file upstream doesn't" means
 * anything.
 */

/** WebKit's own expected-result baselines. Upstream has no *-expected.txt at all. */
const BASELINE_RE = /-expected(-mismatch)?\.(txt|png|wav)$/;

/**
 * WebKit renames a reftest's reference file (foo-ref.html) to foo-expected.html so
 * its test runner finds it. Same content, different name.
 */
const RENAMED_REF_RE = /-expected(-mismatch)?\.(html|htm|xht|xhtml|svg|xml)$/;

/**
 * wpt generates these from a single .js source at serve time; WebKit writes them
 * to disk during import. Everything from `foo.any.html` to
 * `foo.any.shadowrealm-in-window.html` comes from `foo.any.js`, so the source is
 * named by the *first* .any/.window/.worker segment, not the last.
 */
const GENERATED_RE = /\.(any|window|worker)\./;

/** Files with no upstream counterpart by design. */
const IMPORT_METADATA = new Set(['w3c-import.log']);

function basename(filePath) {
  return filePath.slice(filePath.lastIndexOf('/') + 1);
}

/**
 * Why does this WebKit file have no upstream path of the same name?
 * Returns a reason string for import artifacts, or null when the file is a
 * genuine extra (most often a test upstream has since deleted or moved).
 */
export function importArtifactReason(filePath, upstreamFiles) {
  const name = basename(filePath);
  if (IMPORT_METADATA.has(name)) return 'import-metadata';
  if (BASELINE_RE.test(name)) return 'webkit-baseline';
  if (RENAMED_REF_RE.test(name)) return 'renamed-reference';

  if (filePath.endsWith('.html')) {
    const generated = GENERATED_RE.exec(filePath);
    if (generated) {
      const source = `${filePath.slice(0, generated.index)}.${generated[1]}.js`;
      if (upstreamFiles.has(source)) return 'generated-variant';
    }
  }

  return null;
}

const TEST_EXTENSIONS = new Set(['html', 'htm', 'xht', 'xhtml', 'svg']);
const NON_TEST_DIRS = new Set(['support', 'resources', 'tools', 'common', 'docs']);

/**
 * A rough count of things that are actually tests, so headline numbers can say
 * "tests" rather than "files". Deliberately conservative: wpt's real answer lives
 * in a generated MANIFEST.json that isn't committed, and building it needs a full
 * checkout plus a Python run.
 */
export function isTestFile(filePath) {
  const parts = filePath.split('/');
  const name = parts.pop();

  if (parts.some((segment) => NON_TEST_DIRS.has(segment))) return false;
  if (name.startsWith('.')) return false;
  if (/-(ref|notref)\.[^.]+$/.test(name)) return false;
  if (/-expected(-mismatch)?\./.test(name)) return false;

  // foo.any.js / foo.window.js / foo.worker.js are test sources; other .js are support code.
  if (name.endsWith('.js')) return /\.(any|window|worker)\.js$/.test(name);

  return TEST_EXTENSIONS.has(name.slice(name.lastIndexOf('.') + 1));
}
