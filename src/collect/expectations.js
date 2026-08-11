/**
 * WebKit decides what to vendor with LayoutTests/imported/w3c/resources/import-expectations.json:
 * a flat map of upstream paths to one of "import", "import-no-rewrite", "skip" or
 * "skip-new-directories". Keys are prefixes — the most specific one wins — and the
 * root key ("web-platform-tests") supplies the default for anything unlisted.
 *
 * That root default is currently "skip-new-directories", which is why upstream
 * directories absent from the file (ai, fedcm, third_party, conformance-checkers, ...)
 * count as deliberately not imported rather than as tens of thousands of missing files.
 */

const ROOT_KEY = 'web-platform-tests';

export const IMPORTED = 'imported';
export const NOT_IMPORTED = 'not-imported';

export function parseImportExpectations(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  const rules = new Map();

  for (const [key, value] of Object.entries(raw)) {
    if (key !== ROOT_KEY && !key.startsWith(`${ROOT_KEY}/`)) continue;
    rules.set(key.slice(ROOT_KEY.length).replace(/^\//, ''), value);
  }

  const root = rules.get('') ?? 'skip';

  /** The raw expectation string governing an upstream path. */
  function expectationFor(filePath) {
    const parts = filePath.split('/');
    for (let i = parts.length; i > 0; i--) {
      const rule = rules.get(parts.slice(0, i).join('/'));
      if (rule !== undefined) return rule;
    }
    return root;
  }

  /** Only "import" and "import-no-rewrite" mean WebKit vendors the path. */
  function isImported(filePath) {
    return expectationFor(filePath).startsWith('import');
  }

  return { rules, root, expectationFor, isImported };
}
