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
| `modified` | Same path, different contents. |
| `renamed` | Path absent, but the same blob exists elsewhere in the directory. |
| `missing` | Absent from WebKit entirely — the drift signal. |
| `notImported` | `import-expectations.json` says to skip this path. |

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

WebKit *rewrites* some files as it imports them — that is what the `import-no-rewrite` expectation
opts out of. So `modified` mixes deliberate local changes with genuinely stale copies and cannot
distinguish them. **`missing` is the number to trust.**

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
data/           generated snapshot (report.json, meta.json, dirs/<name>.json)
.cache/         the two git mirrors
```

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/report` | Summary totals plus a row per top-level directory. |
| `GET /api/dirs/:name` | File lists for one directory (missing / modified / WebKit only). |
| `GET /healthz` | Liveness plus the snapshot timestamp. |

Both JSON endpoints are gzipped, ETagged and CORS-open, so the data is reusable elsewhere.

## Licence

MIT. Not affiliated with Apple or the W3C.
