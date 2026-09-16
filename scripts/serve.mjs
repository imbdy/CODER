/**
 * Zero-dependency static file server for previewing agent builds.
 *
 *   node scripts/serve.mjs [folder] [port]     (defaults: ./ 4173)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const full = path.resolve(root, `.${pathname}`);
    if (!full.startsWith(root)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    let target = full;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      // SPA-ish fallback and directory default
      const candidate = path.join(target, 'index.html');
      target = fs.existsSync(candidate) ? candidate : path.join(root, 'index.html');
    }
    const body = fs.readFileSync(target);
    response.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`not found: ${error?.message ?? error}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root}`);
  console.log(`→ http://localhost:${port}`);
});
