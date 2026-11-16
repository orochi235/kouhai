import type { Filter, Item, Kind, Tag } from '@core/types.ts';

export type { RepoSummary as Repo } from '@core/repos.ts';
export type { Attachment, Filter, Item, Kind, Outcome, Tag } from '@core/types.ts';

import type { RepoSummary as Repo } from '@core/repos.ts';

export type Listing = {
  version: string;
  counts: { unread: number; owed: number; inbox: number; questions: number; tasks: number };
  repos: Repo[];
  tags: Tag[];
  items: Item[];
};

/** A change to a tag itself, as `POST /api/tags` takes it. */
export type TagEdit = {
  action: 'rename' | 'color' | 'delete';
  name: string;
  to?: string;
  color?: string;
};

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json() as Promise<T>;
}

export const api = {
  list: (
    filter: Filter,
    kind: Kind | null,
    repo: string | null,
    tag: string | null,
    text: string,
  ) => {
    const q = new URLSearchParams({ filter });
    if (kind) q.set('kind', kind);
    if (repo) q.set('repo', repo);
    if (tag) q.set('tag', tag);
    if (text) q.set('text', text);
    return fetch(`/api/items?${q}`).then((r) => json<Listing>(r));
  },
  post: (
    path:
      | 'read'
      | 'archive'
      | 'pin'
      | 'misfile'
      | 'tag'
      | 'tags'
      | 'read-all'
      | 'reveal'
      | 'open-path',
    body: object,
  ) =>
    fetch(`/api/${path}`, { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<unknown>(r),
    ),
};

/** Calls `onChange` whenever the ledger changes, and `onLink` as the connection drops or returns. */
export function watch(onChange: (version: string) => void, onLink: (up: boolean) => void) {
  const es = new EventSource('/api/events');
  es.addEventListener('change', (e) => {
    onLink(true);
    onChange(JSON.parse((e as MessageEvent).data).version);
  });
  es.onerror = () => onLink(false);
  return () => es.close();
}
