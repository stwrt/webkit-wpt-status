import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
export const cacheDir = path.join(rootDir, '.cache');
export const dataDir = path.join(rootDir, 'data');

/** Where WebKit keeps its vendored copy of WPT. */
export const WEBKIT_WPT_PREFIX = 'LayoutTests/imported/w3c/web-platform-tests';

/** The file that decides which upstream paths WebKit imports at all. */
export const IMPORT_EXPECTATIONS_PATH =
  'LayoutTests/imported/w3c/resources/import-expectations.json';

export const UPSTREAM = {
  key: 'upstream',
  name: 'web-platform-tests/wpt',
  url: 'https://github.com/web-platform-tests/wpt.git',
  ref: 'master',
  dir: path.join(cacheDir, 'wpt'),
};

export const WEBKIT = {
  key: 'webkit',
  name: 'WebKit/WebKit',
  url: 'https://github.com/WebKit/WebKit.git',
  ref: 'main',
  dir: path.join(cacheDir, 'webkit'),
};

/** Per-bucket cap on the file lists written to data/dirs/<name>.json. */
export const MAX_FILES_PER_BUCKET = 2000;
