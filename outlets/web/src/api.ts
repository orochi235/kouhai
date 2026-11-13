import type { Filter, Item } from '@core/types.ts';

export type { RepoSummary as Repo } from '@core/repos.ts';
export type { Attachment, Filter, Item, Outcome } from '@core/types.ts';

import type { RepoSummary as Repo } from '@core/repos.ts';

export type Listing = {
  version: string;
  counts: { unread: number; owed: number; inbox: number };
  repos: Repo[];
  items: Item[];
};

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json() as Promise<T>;
}

export const api = {
  list: (filter: Filter, repo: string | null, text: string) => {
    const q = new URLSearchParams({ filter });
    if (repo) q.set('repo', repo);
    if (text) q.set('text', text);
    return fetch(`/api/items?${q}`).then((r) => json<Listing>(r));
  },
  post: (path: 'read' | 'archive' | 'pin' | 'read-all' | 'reveal' | 'open-path', body: object) =>
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
