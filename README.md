# WebKit WPT Status

WebKit vendors a copy of [web-platform-tests](https://github.com/web-platform-tests/wpt) into
[`LayoutTests/imported/w3c/web-platform-tests`](https://github.com/WebKit/WebKit/tree/main/LayoutTests/imported/w3c/web-platform-tests).
Unlike Chromium, it does this **without a pinned upstream revision** — there is no manifest saying
"we are at wpt@abc123". Imports land one directory at a time ("Resync `webaudio` from WPT
Upstream"), so there is no straightforward way to ask how far behind the copy has fallen.

This is a small Node app that answers that question, directory by directory.

## How it works

Both repositories are cloned blobless, shallow and **without a working tree**, and every file is
compared by its **git blob SHA**. A blob SHA is a hash of the file's contents, so two files sharing
one are byte-for-byte identical. No file contents are downloaded and no test is run — a full
collection takes about four seconds and leaves ~20 MB on disk.

Each upstream file lands in one bucket:

| Bucket | Meaning |
| --- | --- |
| `identical` | Same path, same blob SHA. |
| `modified` | Same path, different contents. Shown as **not resynced**. |
| `renamed` | Path absent, but the same blob exists elsewhere in the directory. |
| `missing` | Absent from WebKit entirely — the drift signal. |
| `notImported` | `import-expectations.json` says to skip this path. |

Two percentages are derived from those, and the difference between them matters:

```
coverage = (identical + renamed + modified) / (that + missing)   # WebKit has the test at all
in sync  = (identical + renamed)           / (that + missing)   # byte-for-byte identical
```

**Coverage is what the site leads with.** In sync is the stricter number and is also shown, but
it makes trivial drift look like a hole: every file in `compression/` differs from upstream by a
single `// META: global=…` header line, which scores 0% in sync and 89.5% coverage. The tests are
all there.

Two details keep the numbers honest:

- **`import-expectations.json` is resolved by longest prefix**, with its root key (currently
  `skip-new-directories`) as the default. Upstream directories WebKit has never triaged —
  `ai`, `fedcm`, `third_party`, `conformance-checkers` — are therefore *not imported*, not
  missing. Without this, the report would claim ~80,000 missing files.
- **Import artifacts are recognised and excluded.** WebKit renames reftest references
  (`foo-ref.html` → `foo-expected.html`), writes out the variants wptserve normally generates
  from a `.any.js` source, and adds its own `-expected.txt` baselines. Renames are recovered by
  content, and the rest are filtered out of "WebKit only".

### Known caveat

`modified` records *that* two files differ, never *how much*. Across a sample of 40 modified test
files diffed against upstream, 73% differed by one or two lines, 10% by three to ten, and 8% by
more than fifty. So a large "not resynced" count usually means upstream edited a header and WebKit
has not resynced — not that the tests have diverged in substance.

It also can't tell you the cause. WebKit *rewrites* some files as it imports them — that is what
the `import-no-rewrite` expectation opts out of — so `modified` mixes deliberate local changes
with genuinely stale copies. **`missing` is the number to trust.**

## Running it

```sh
npm install
npm run collect     # clone/refresh the mirrors and write data/
npm run build       # build the frontend into web/dist
npm start           # serve on http://localhost:8080
```

For frontend work, run `npm start` in one shell and `npm run dev` in another; Vite proxies `/api`
to the Node server.

```sh
npm test            # unit tests for expectation resolution and bucketing
```

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Listen port. |
| `HOST` | `0.0.0.0` | Listen address. |
| `REFRESH_INTERVAL_HOURS` | `6` | How often the server re-runs the collector. `0` disables it. |
| `COLLECT_ON_START` | unset | Set to `1` to collect immediately on boot. |

A refresh runs the collector in a child process and only swaps in the new snapshot once it loads
cleanly, so a failed collection keeps serving the last good data. If the host has no `git` binary
the server says so once at boot and skips refreshing entirely — see below.

## Deployment

Deployed to [mojave](https://mojave.sh) as a service (`mojave.json`), which runs `npm start` on a
1 vCPU / 1024 MiB microVM. The collector peaks around 330 MB, which is why the default 256 MiB
isn't enough.

That microVM has **no `git` binary**, so the app cannot collect where it runs. Instead
`.github/workflows/refresh.yml` runs the collector daily on GitHub Actions and commits `data/`,
and mojave's push webhook redeploys. `data/` is therefore committed on purpose — it's the served
snapshot, not build output. `npm run build` still attempts a collection first (`collect:soft`) so
a build somewhere that *does* have git picks up fresher data; a failure there is logged and
ignored.

To refresh on demand: `gh workflow run refresh.yml`, or run `npm run collect` locally and commit.

## Layout

```
src/collect/    the comparison: repo mirrors, expectations, bucketing, CLI
src/server/     node:http server — JSON API plus the built frontend, zero runtime deps
web/            Vite + React + TypeScript + Tailwind + shadcn/ui
data/           the served snapshot: report.json (top-level rows + totals),
                tree.json (counts for every directory at every depth),
                files.json (sorted missing/modified/WebKit-only paths)
.cache/         the two git mirrors
```

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/report` | Summary totals plus a row per top-level directory. |
| `GET /api/dirs/<path>` | One directory at **any depth** — its counts, its immediate subdirectories with theirs, and the files beneath it. |
| `GET /healthz` | Liveness plus the snapshot timestamp. |

Counts roll up into every ancestor, so `/api/dirs/css/css-grid` and
`/api/dirs/css/css-grid/grid-lanes` are as real as `/api/dirs/css` — about 9,000 directories in
all. File lists are stored once as three sorted arrays and sliced by prefix with a binary search,
rather than duplicated per directory.

The JSON endpoints are gzipped, ETagged and CORS-open, so the data is reusable elsewhere.

## Licence

MIT. Not affiliated with Apple or the W3C.
