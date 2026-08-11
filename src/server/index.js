import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';

import { rootDir } from '../collect/config.js';
import { Store } from './store.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const REFRESH_INTERVAL_HOURS = Number(process.env.REFRESH_INTERVAL_HOURS ?? 6);
const COLLECT_ON_START = process.env.COLLECT_ON_START === '1';

const webRoot = path.join(rootDir, 'web', 'dist');
const collectScript = path.join(rootDir, 'src', 'collect', 'index.js');
const store = new Store();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function log(message) {
  process.stdout.write(`[server] ${message}\n`);
}

function sendJsonPayload(req, res, payload, { maxAge = 60 } = {}) {
  res.setHeader('ETag', payload.etag);
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.setHeader('Content-Type', MIME['.json']);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Accept-Encoding');

  if (req.headers['if-none-match'] === payload.etag) {
    res.writeHead(304).end();
    return;
  }

  const wantsGzip = (req.headers['accept-encoding'] ?? '').includes('gzip');
  const body = wantsGzip ? payload.gzipped : payload.body;
  if (wantsGzip) res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', body.length);
  res.writeHead(200).end(req.method === 'HEAD' ? undefined : body);
}

function sendError(res, status, message) {
  const body = JSON.stringify({ error: message });
  res
    .writeHead(status, {
      'Content-Type': MIME['.json'],
      'Content-Length': Buffer.byteLength(body),
    })
    .end(body);
}

/** Resolve a URL path inside web/dist, refusing anything that escapes it. */
function resolveStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const resolved = path.resolve(webRoot, `.${path.posix.normalize(decoded)}`);
  if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) return null;
  return resolved;
}

function sendFile(req, res, filePath, { immutable = false } = {}) {
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', MIME[path.extname(filePath)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  res.writeHead(200);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, urlPath) {
  if (!fs.existsSync(webRoot)) {
    return sendError(res, 503, 'Frontend not built. Run `npm run build`.');
  }

  const resolved = resolveStatic(urlPath);
  if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    // Vite fingerprints everything under /assets/, so those are safe to pin.
    return sendFile(req, res, resolved, { immutable: urlPath.startsWith('/assets/') });
  }

  // Single-page app: unknown paths render the shell rather than 404.
  const index = path.join(webRoot, 'index.html');
  if (!fs.existsSync(index)) return sendError(res, 503, 'Frontend not built. Run `npm run build`.');
  return sendFile(req, res, index);
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'Method not allowed');
  }

  if (pathname === '/healthz') {
    const ok = store.report !== null;
    const body = JSON.stringify({ ok, generatedAt: store.generatedAt, collecting });
    return res
      .writeHead(ok ? 200 : 503, {
        'Content-Type': MIME['.json'],
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      })
      .end(req.method === 'HEAD' ? undefined : body);
  }

  if (pathname === '/api/report') {
    if (!store.report) return sendError(res, 503, 'No report yet. Run `npm run collect`.');
    return sendJsonPayload(req, res, store.report);
  }

  if (pathname.startsWith('/api/dirs/')) {
    const name = pathname.slice('/api/dirs/'.length);
    const detail = await store.detail(decodeURIComponent(name));
    if (!detail) return sendError(res, 404, 'Unknown directory');
    return sendJsonPayload(req, res, detail, { maxAge: 300 });
  }

  if (pathname.startsWith('/api/')) return sendError(res, 404, 'Not found');

  return serveStatic(req, res, pathname);
}

let collecting = false;

async function refresh(reason) {
  if (collecting) return;
  collecting = true;
  const started = Date.now();
  log(`refresh started (${reason})`);

  try {
    const code = await new Promise((resolve, reject) => {
      const child = fork(collectScript, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('error', reject);
      child.on('exit', resolve);
    });

    if (code !== 0) {
      // Keep serving the previous snapshot rather than going dark.
      log(`refresh failed with exit code ${code}; keeping existing data`);
      return;
    }

    await store.load();
    log(`refresh finished in ${Date.now() - started}ms, data from ${store.generatedAt}`);
  } catch (error) {
    log(`refresh error: ${error.message}; keeping existing data`);
  } finally {
    collecting = false;
  }
}

async function main() {
  try {
    await store.load();
    log(`loaded report generated at ${store.generatedAt}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    log('no data/report.json yet');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`request failed: ${error.stack ?? error.message}`);
      if (!res.headersSent) sendError(res, 500, 'Internal error');
      else res.end();
    });
  });

  server.listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT}`));

  if (COLLECT_ON_START || !store.report) refresh('startup');
  if (REFRESH_INTERVAL_HOURS > 0) {
    setInterval(() => refresh('scheduled'), REFRESH_INTERVAL_HOURS * 3600_000).unref();
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

main().catch((error) => {
  log(`fatal: ${error.stack ?? error.message}`);
  process.exit(1);
});
