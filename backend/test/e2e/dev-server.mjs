// Server pengujian lokal: melayani public/ (dengan header keamanan dari _headers, termasuk CSP),
// meneruskan /api/* ke Worker asli (dengan Firebase TIRUAN), dan menyediakan /__qr, /__decode untuk pengganti pustaka.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../src/index.js';
import { createFake } from '../fake-google.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../../../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function parseHeaders() {
  const out = {};
  for (const line of fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8').split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

function proxyHelper(helperPort, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: helperPort, path: urlPath, method, headers: body ? { 'content-length': body.length } : {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function startServer({ port = 8788, helperPort = 8791 } = {}) {
  const fake = await createFake();
  fake.install();
  const env = { ...fake.env };
  const secHeaders = parseHeaders();
  const apiLog = [];

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);

      if (url.pathname === '/__qr' || url.pathname === '/__decode') {
        const out = await proxyHelper(helperPort, req.method, '/' + url.pathname.slice(3) + url.search, body.length ? body : null);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(out);
      }
      if (url.pathname.startsWith('/api/')) {
        const r = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
        const out = await worker.fetch(r, env);
        apiLog.push({ method: req.method, path: url.pathname, status: out.status });
        const h = {};
        out.headers.forEach((v, k) => (h[k] = v));
        res.writeHead(out.status, h);
        return res.end(Buffer.from(await out.arrayBuffer()));
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.resolve(PUBLIC, '.' + rel);
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file) === '_headers') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', ...secHeaders });
      res.end(fs.readFileSync(file));
    } catch (e) {
      console.error('dev-server error', e);
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, fake, env, apiLog, close: () => new Promise((r) => server.close(r)) };
}
