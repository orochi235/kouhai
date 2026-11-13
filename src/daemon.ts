import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { huedOf } from './hued.ts';
import { menu } from './menu.ts';
import { port } from './paths.ts';
import { Store } from './store.ts';
import { FILTERS, type Filter, type Question } from './types.ts';

const DIST = fileURLToPath(new URL('../ui/dist/', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

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

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (q: URLSearchParams, body: Record<string, unknown>) => unknown;

/** Every repo that has a question, with its .hued colors, for the sidebar. */
export function repos(all: Question[]) {
  const by = new Map<
    string,
    { repo: string; root: string | null; unread: number; total: number }
  >();
  for (const q of all) {
    if (!q.repo) continue;
    const r = by.get(q.repo) ?? { repo: q.repo, root: q.root, unread: 0, total: 0 };
    r.total++;
    if (q.answer && !q.readAt) r.unread++;
    by.set(q.repo, r);
  }
  return [...by.values()]
    .sort((a, b) => b.unread - a.unread || a.repo.localeCompare(b.repo))
    .map((r) => ({ ...r, hued: r.root ? huedOf(r.root) : null }));
}

export function routes(store: Store): Record<string, Handler> {
  const need = (id: unknown) => {
    if (typeof id !== 'string' && typeof id !== 'number')
      throw new HttpError(400, 'id is required');
    const q = store.get(id);
    if (!q) throw new HttpError(404, `no question ${id}`);
    return q;
  };
  return {
    'GET /api/version': () => ({ version: store.version() }),
    'GET /api/questions': (q) => {
      const f = (q.get('filter') ?? 'inbox') as Filter;
      if (!FILTERS.includes(f)) throw new HttpError(400, `filter is one of ${FILTERS.join(', ')}`);
      return {
        version: store.version(),
        counts: store.counts(),
        repos: repos(store.list('inbox')),
        questions: store.list(f, {
          repo: q.get('repo') ?? undefined,
          text: q.get('text') ?? undefined,
        }),
      };
    },
    'GET /api/question': (q) => need(q.get('id')),
    'POST /api/read': (_q, b) => store.setRead(need(b.id).id, b.read !== false),
    'POST /api/archive': (_q, b) => store.setArchived(need(b.id).id, b.archived !== false),
    'POST /api/pin': (_q, b) => store.setPinned(need(b.id).id, b.pinned !== false),
    'POST /api/read-all': () => ({ marked: store.readAll() }),
    'POST /api/reveal': (_q, b) => {
      const q = need(b.id);
      // Only a path some answer attached, so the page can't be used to open arbitrary files.
      const a = q.attachments.find(
        (x) => x.ref === b.ref && (x.kind === 'file' || x.kind === 'transom'),
      );
      if (!a) throw new HttpError(404, 'no such attachment');
      execFile('open', ['-R', a.ref]);
      return { revealed: a.ref };
    },
    'GET /api/menu': () => menu(store.counts(), store.list('unread', { limit: 10 })),
  };
}

function serveStatic(path: string, res: http.ServerResponse) {
  const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || rel === '/' || !extname(file)) {
    file = join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('The inbox page is not built: npm run build in ~/src/dixeram');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

export function createServer(store: Store) {
  const table = routes(store);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = `${req.method} ${url.pathname}`;
    const handler = table[key];
    if (!handler) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/'))
        return serveStatic(url.pathname, res);
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `no route ${key}` }));
      return;
    }
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'body is not JSON' }));
        return;
      }
    }
    try {
      const out = await handler(url.searchParams, body);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(out));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

export function runDaemon(): void {
  const store = new Store();
  const prune = () => {
    const n = store.prune();
    if (n.questions || n.turns)
      console.log(`pruned ${n.questions} archived answers, ${n.turns} turns`);
  };
  prune();
  setInterval(prune, DAY_MS).unref();
  createServer(store).listen(port(), '::', () => {
    console.log(`dixeram inbox on http://localhost:${port()}`);
  });
}
