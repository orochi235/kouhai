import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { extname } from 'node:path';
import { port } from '../engine/paths.ts';
import { repos } from '../engine/repos.ts';
import { Store } from '../engine/store.ts';
import { FILTERS, type Filter, type Item } from '../engine/types.ts';
import type { Handler, Outlet } from './outlet.ts';
import { serveStatic } from './static.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How often the server checks the store for changes to push; writers are other processes. */
const WATCH_MS = 500;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * A local path the page may open: absolute, linked from the item's own note, and present on disk.
 * A `:line` suffix is dropped. Anything else is refused, so the page can't open arbitrary files.
 */
export function notePath(note: string | null, raw: unknown): string | null {
  if (!note || typeof raw !== 'string') return null;
  const path = decodeURI(raw.replace(/^file:\/\//, '')).replace(/:\d+(:\d+)?$/, '');
  if (!path.startsWith('/') || path.includes('/../')) return null;
  if (!note.includes(path)) return null;
  return existsSync(path) ? path : null;
}

export const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** An image the page may show for an item: one it attached as a file or render, or its note links. */
export function itemImage(q: Item, raw: unknown): string | null {
  if (typeof raw !== 'string' || !IMAGE_TYPES[extname(raw).toLowerCase()]) return null;
  const attached = q.attachments.some(
    (a) => a.ref === raw && (a.kind === 'file' || a.kind === 'transom'),
  );
  if (attached) return existsSync(raw) ? raw : null;
  return notePath(q.note, raw);
}

/** `GET /api/image?id=&path=`: the image's bytes, sandboxed so an SVG can't run as a page here. */
function image(store: Store, url: URL, res: http.ServerResponse) {
  const q = store.get(url.searchParams.get('id') ?? '');
  const path = q ? itemImage(q, url.searchParams.get('path')) : null;
  if (!path) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'no such image on this item' }));
    return;
  }
  res.writeHead(200, {
    'content-type': IMAGE_TYPES[extname(path).toLowerCase()] as string,
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'cache-control': 'no-cache',
  });
  res.end(readFileSync(path));
}

/** The ledger API every outlet uses. Nothing here decides how anything looks. */
export function routes(store: Store): Record<string, Handler> {
  const need = (id: unknown) => {
    if (typeof id !== 'string' && typeof id !== 'number')
      throw new HttpError(400, 'id is required');
    const q = store.get(id);
    if (!q) throw new HttpError(404, `no item ${id}`);
    return q;
  };
  return {
    'GET /api/version': () => ({ version: store.version() }),
    'GET /api/items': (q) => {
      const f = (q.get('filter') ?? 'inbox') as Filter;
      if (!FILTERS.includes(f)) throw new HttpError(400, `filter is one of ${FILTERS.join(', ')}`);
      const limit = q.get('limit');
      return {
        version: store.version(),
        counts: store.counts(),
        repos: repos(store.list('inbox')),
        items: store.list(f, {
          repo: q.get('repo') ?? undefined,
          text: q.get('text') ?? undefined,
          limit: limit ? Math.min(500, Math.max(1, Number(limit) || 1)) : undefined,
        }),
      };
    },
    'GET /api/item': (q) => need(q.get('id')),
    'POST /api/read': (_q, b) => store.setRead(need(b.id).id, b.read !== false),
    'POST /api/archive': (_q, b) => store.setArchived(need(b.id).id, b.archived !== false),
    'POST /api/pin': (_q, b) => store.setPinned(need(b.id).id, b.pinned !== false),
    'POST /api/misfile': (_q, b) =>
      store.setMisfiled(
        need(b.id).id,
        b.misfiled !== false,
        typeof b.why === 'string' ? b.why : null,
      ),
    'POST /api/read-all': () => ({ marked: store.readAll() }),
    'POST /api/reveal': (_q, b) => {
      const q = need(b.id);
      // Only a path an item attached, so no outlet can open arbitrary files.
      const a = q.attachments.find(
        (x) => x.ref === b.ref && (x.kind === 'file' || x.kind === 'transom'),
      );
      if (!a) throw new HttpError(404, 'no such attachment');
      execFile('open', ['-R', a.ref]);
      return { revealed: a.ref };
    },
    'POST /api/open-path': (_q, b) => {
      const q = need(b.id);
      const path = notePath(q.note, b.path);
      if (!path) throw new HttpError(404, 'that path is not linked from this note');
      execFile('open', [path]);
      return { opened: path };
    },
  };
}

/** `GET /api/events`: a server-sent `change` event, carrying the new version, whenever the ledger changes. */
function events(store: Store) {
  const clients = new Set<http.ServerResponse>();
  let last = store.version();
  const timer = setInterval(() => {
    if (!clients.size) return;
    const v = store.version();
    if (v === last) return;
    last = v;
    for (const res of clients)
      res.write(`event: change\ndata: ${JSON.stringify({ version: v })}\n\n`);
  }, WATCH_MS);
  timer.unref();
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    last = store.version();
    res.write(`event: change\ndata: ${JSON.stringify({ version: last })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  };
}

export function createServer(store: Store, outlets: Outlet[] = []) {
  const table: Record<string, Handler> = { ...routes(store) };
  for (const o of outlets) {
    for (const [key, h] of Object.entries(o.routes?.(store) ?? {})) {
      const [method, path] = key.split(' ');
      table[`${method} /outlets/${o.name}${path}`] = h;
    }
  }
  // Longest mount first, so `/overlay` wins over `/`.
  const mounts = outlets
    .flatMap((o) => (o.static ? [{ name: o.name, ...o.static }] : []))
    .sort((a, b) => b.mount.length - a.mount.length);
  const stream = events(store);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = `${req.method} ${url.pathname}`;
    if (key === 'GET /api/events') return stream(req, res);
    if (key === 'GET /api/image') return image(store, url, res);
    const handler = table[key];
    if (!handler) {
      const mount = mounts.find((m) => url.pathname.startsWith(m.mount));
      if (req.method === 'GET' && mount && !url.pathname.startsWith('/api/')) {
        return serveStatic(
          mount.dir,
          mount.name,
          url.pathname.slice(mount.mount.length - 1) || '/',
          res,
        );
      }
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

export function runDaemon(outlets: Outlet[]): void {
  const store = new Store();
  const prune = () => {
    const n = store.prune();
    if (n.items || n.turns) console.log(`pruned ${n.items} archived items, ${n.turns} turns`);
  };
  prune();
  setInterval(prune, DAY_MS).unref();
  createServer(store, outlets).listen(port(), '::', () => {
    console.log(
      `dixeram on http://localhost:${port()}, outlets: ${outlets.map((o) => o.name).join(', ')}`,
    );
  });
}
