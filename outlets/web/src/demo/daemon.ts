import type { Filter, Item, Kind, Settings, Tag } from '@core/types.ts';
import { SETTINGS } from '@core/types.ts';
import type { Listing, Repo } from '../api.ts';
import glyphs from './glyphs.json';
import { ARRIVALS, HUED, itemOf, SEEDS, type Seed, TAGS } from './ledger.ts';

/** How long after one arrival the next comes, and how long each stays owed before it settles. */
const ARRIVE_MS = 20_000;
const SETTLE_MS = 9_000;

const MATCH: Record<Filter, (q: Item) => boolean> = {
  inbox: (q) => !q.archivedAt,
  owed: (q) => !q.archivedAt && !q.outcome,
  unread: (q) => !q.archivedAt && !!q.outcome && !q.readAt,
  pinned: (q) => q.pinned,
  archived: (q) => !!q.archivedAt,
  all: () => true,
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The daemon's HTTP API over an in-memory ledger, so the page runs unchanged with nothing behind
 * it. Writes change the ledger for this visit only.
 */
export function createDemoDaemon() {
  const now = Date.now();
  const items = SEEDS.map((s, i) => itemOf(i + 1, s, now));
  const tags: Tag[] = TAGS.map((t, i) => ({ id: i + 1, ...t, count: 0 }));
  let settings: Settings = { ...SETTINGS };
  let version = 1;
  const listeners = new Set<(version: string) => void>();

  const changed = () => {
    version++;
    for (const l of listeners) l(String(version));
  };
  const need = (ref: unknown) => {
    const q = items.find(
      (i) => i.ref === ref || String(i.id) === String(ref).replace(/^[qt]-/, ''),
    );
    if (!q) throw new HttpError(404, `no item ${String(ref)}`);
    return q;
  };
  const touch = (q: Item, patch: Partial<Item>) => {
    Object.assign(q, patch, { updatedAt: Date.now() });
    changed();
    return q;
  };
  const counted = () =>
    tags.map((t) => ({
      ...t,
      count: items.filter((q) => !q.archivedAt && q.tags.includes(t.name)).length,
    }));

  const repos = (): Repo[] => {
    const by = new Map<string, Repo>();
    for (const q of items) {
      if (q.archivedAt || !q.repo) continue;
      const r = by.get(q.repo) ?? {
        repo: q.repo,
        root: q.root,
        unread: 0,
        owed: 0,
        total: 0,
        hued: HUED[q.repo] ?? null,
      };
      r.total++;
      if (q.outcome && !q.readAt) r.unread++;
      if (!q.outcome) r.owed++;
      by.set(q.repo, r);
    }
    return [...by.values()].sort(
      (a, b) => b.unread + b.owed - (a.unread + a.owed) || a.repo.localeCompare(b.repo),
    );
  };

  const listing = (p: URLSearchParams): Listing => {
    const filter = (p.get('filter') ?? 'inbox') as Filter;
    const kind = p.get('kind') as Kind | null;
    const repo = p.get('repo');
    const tag = p.get('tag');
    const text = p.get('text')?.toLowerCase();
    const inbox = items.filter(MATCH.inbox);
    return {
      version: String(version),
      counts: {
        unread: items.filter(MATCH.unread).length,
        owed: items.filter(MATCH.owed).length,
        inbox: inbox.length,
        questions: inbox.filter((q) => q.kind === 'question').length,
        tasks: inbox.filter((q) => q.kind === 'task').length,
      },
      repos: repos(),
      tags: counted(),
      items: items
        .filter(MATCH[filter])
        .filter((q) => !kind || q.kind === kind)
        .filter((q) => !repo || q.repo === repo)
        .filter((q) => !tag || q.tags.includes(tag))
        .filter(
          (q) =>
            !text || q.text.toLowerCase().includes(text) || !!q.note?.toLowerCase().includes(text),
        )
        .sort((a, b) => (b.settledAt ?? b.raisedAt) - (a.settledAt ?? a.raisedAt)),
    };
  };

  const editTags = (b: Record<string, unknown>) => {
    const t = tags.find((x) => x.name === b.name);
    if (b.action === 'restore') {
      const back = { id: tags.length + 1, name: String(b.name), color: String(b.color), count: 0 };
      tags.push(back);
      for (const ref of (b.items as string[] | undefined) ?? []) need(ref).tags.push(back.name);
      changed();
      return back;
    }
    if (!t) throw new HttpError(400, `no tag ${String(b.name)}`);
    if (b.action === 'color') t.color = String(b.color);
    if (b.action === 'rename') {
      for (const q of items) q.tags = q.tags.map((n) => (n === t.name ? String(b.to) : n));
      t.name = String(b.to);
    }
    if (b.action === 'delete') {
      const had = items.filter((q) => q.tags.includes(t.name)).map((q) => q.ref);
      for (const q of items) q.tags = q.tags.filter((n) => n !== t.name);
      tags.splice(tags.indexOf(t), 1);
      changed();
      return { name: t.name, color: t.color, items: had };
    }
    changed();
    return t;
  };

  const routes: Record<string, (p: URLSearchParams, b: Record<string, unknown>) => unknown> = {
    'GET /api/items': (p) => listing(p),
    'GET /api/item': (p) => need(p.get('id')),
    'GET /api/stale': () => ({ changed: [] }),
    'GET /api/settings': () => settings,
    'POST /api/settings': (_p, b) => {
      settings = { ...settings, ...b };
      return settings;
    },
    'GET /outlets/web/glyphs': () => glyphs,
    'POST /api/read': (_p, b) =>
      touch(need(b.id), { readAt: b.read === false ? null : Date.now() }),
    'POST /api/archive': (_p, b) =>
      touch(need(b.id), { archivedAt: b.archived === false ? null : Date.now() }),
    'POST /api/pin': (_p, b) => touch(need(b.id), { pinned: b.pinned !== false }),
    'POST /api/misfile': (_p, b) =>
      touch(need(b.id), {
        misfiledAt: b.misfiled === false ? null : Date.now(),
        misfiledWhy: b.misfiled === false ? null : ((b.why as string | null) ?? null),
      }),
    'POST /api/tag': (_p, b) => {
      const q = need(b.id);
      const name = String(b.tag).trim();
      if (b.on === false) q.tags = q.tags.filter((n) => n !== name);
      else if (!q.tags.includes(name)) {
        q.tags.push(name);
        if (!tags.some((t) => t.name === name))
          tags.push({ id: tags.length + 1, name, color: '#2f7f77', count: 0 });
      }
      return touch(q, {});
    },
    'POST /api/tags': (_p, b) => editTags(b),
    'POST /api/read-all': () => {
      const refs = items.filter(MATCH.unread).map((q) => q.ref);
      for (const q of items) if (refs.includes(q.ref)) q.readAt = Date.now();
      changed();
      return { marked: refs.length, refs };
    },
    // A demo has no files to show in Finder.
    'POST /api/reveal': () => ({}),
    'POST /api/open-path': () => ({}),
  };

  const arrive = (s: Seed) => {
    const q = itemOf(items.length + 1, { ...s, settled: undefined }, Date.now());
    items.push(q);
    changed();
    const settled = s.settled;
    if (!settled) return;
    setTimeout(() => {
      const at = Date.now();
      touch(q, {
        outcome: settled.outcome,
        note: settled.note,
        verdict: settled.verdict ?? null,
        basis: settled.basis ?? null,
        settledAt: at,
      });
    }, SETTLE_MS);
  };
  ARRIVALS.forEach((s, i) => {
    setTimeout(() => arrive(s), ARRIVE_MS * (i + 1));
  });

  return {
    async fetch(url: URL, init?: RequestInit): Promise<Response> {
      const route = routes[`${init?.method ?? 'GET'} ${url.pathname}`];
      const reply = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (!route) return reply(404, { error: `no route ${url.pathname}` });
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return reply(200, route(url.searchParams, body));
      } catch (err) {
        return reply(err instanceof HttpError ? err.status : 400, {
          error: (err as Error).message,
        });
      }
    },
    subscribe(l: (version: string) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    version: () => String(version),
  };
}
