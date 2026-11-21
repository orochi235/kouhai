import { existsSync, readFileSync } from 'node:fs';
import type http from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

/** Serves a built single-page outlet: a file if it exists under `dir`, else its index.html. */
export function serveStatic(dir: string, name: string, path: string, res: http.ServerResponse) {
  const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, rel);
  if (!file.startsWith(dir) || !existsSync(file) || rel === '/' || !extname(file)) {
    file = join(dir, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end(`The ${name} outlet is not built: npm run build in ~/src/kouhai`);
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}
