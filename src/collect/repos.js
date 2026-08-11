import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// ls-tree output for a big repo is ~10MB of text; the default 1MB buffer is far too small.
const MAX_BUFFER = 512 * 1024 * 1024;

async function git(cwd, args, { maxBuffer = MAX_BUFFER } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    maxBuffer,
    encoding: 'utf8',
  });
  return stdout;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone (or update) a blobless, shallow, working-tree-less mirror.
 *
 * `--filter=blob:none` skips file contents, `--depth=1` skips history and
 * `--no-checkout` is what keeps this cheap: checking out would make git fetch
 * every blob it just declined to download (~9GB for WebKit vs. a fraction of
 * that for trees alone). We only ever need `git ls-tree`, which reads trees.
 */
export async function syncRepo(repo, log = () => {}) {
  const started = Date.now();
  const gitDir = path.join(repo.dir, '.git');

  if (!(await exists(gitDir))) {
    log(`cloning ${repo.name} (blobless, depth 1, no checkout)`);
    await fs.mkdir(path.dirname(repo.dir), { recursive: true });
    await execFileAsync(
      'git',
      [
        'clone',
        '--filter=blob:none',
        '--depth=1',
        '--no-checkout',
        '--single-branch',
        '--branch',
        repo.ref,
        repo.url,
        repo.dir,
      ],
      { maxBuffer: MAX_BUFFER },
    );
  } else {
    log(`fetching ${repo.name}`);
  }

  // Always fetch so an existing cache is brought up to date, and so both the
  // fresh-clone and reuse paths converge on the same tree-ish: FETCH_HEAD.
  await git(repo.dir, ['fetch', '--depth=1', '--force', '--prune', 'origin', repo.ref]);
  // Shallow fetches leave the previous snapshot's trees behind; without this the
  // cache grows by a full tree set on every run.
  await git(repo.dir, ['gc', '--auto', '--quiet']).catch(() => {});

  const [sha, committedAt, subject] = (
    await git(repo.dir, ['log', '-1', '--format=%H%n%cI%n%s', 'FETCH_HEAD'])
  )
    .trimEnd()
    .split('\n');

  log(`${repo.name} @ ${sha.slice(0, 10)} (${committedAt}) in ${Date.now() - started}ms`);
  return { ...repo, sha, committedAt, subject };
}

/**
 * Map of path -> blob SHA for every file under `prefix`, with `prefix` stripped
 * so the two repositories share one namespace.
 *
 * Blob SHAs are content hashes, so equality here means the file is byte-for-byte
 * identical in both repositories — no file contents need to be downloaded.
 */
export async function listTree(repo, prefix = '') {
  const args = ['ls-tree', '-r', '-z', 'FETCH_HEAD'];
  if (prefix) args.push('--', prefix);

  const stdout = await git(repo.dir, args);
  const strip = prefix ? `${prefix}/` : '';
  const files = new Map();

  for (const entry of stdout.split('\0')) {
    if (!entry) continue;
    // "<mode> SP <type> SP <sha> TAB <path>"; -z means paths are never quoted.
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const meta = entry.slice(0, tab);
    const filePath = entry.slice(tab + 1);
    if (!meta.startsWith('100')) continue; // blobs only: skip submodules (160000)
    const sha = meta.slice(meta.lastIndexOf(' ') + 1);
    if (strip) {
      if (!filePath.startsWith(strip)) continue;
      files.set(filePath.slice(strip.length), sha);
    } else {
      files.set(filePath, sha);
    }
  }

  return files;
}

/** Read one file out of the clone. Blobless clones fetch it on demand. */
export async function readFile(repo, filePath) {
  return git(repo.dir, ['show', `FETCH_HEAD:${filePath}`]);
}
