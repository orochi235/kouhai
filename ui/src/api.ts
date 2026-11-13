import type { Filter, Question } from '@core/types.ts';

export type { Attachment, Filter, Question } from '@core/types.ts';

export type Repo = {
  repo: string;
  root: string | null;
  unread: number;
  total: number;
  hued: { bg: string; fg: string; icon: string } | null;
};

export type Listing = {
  version: string;
  counts: { unread: number; waiting: number; inbox: number };
  repos: Repo[];
  questions: Question[];
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
    return fetch(`/api/questions?${q}`).then((r) => json<Listing>(r));
  },
  version: () => fetch('/api/version').then((r) => json<{ version: string }>(r)),
  post: (path: 'read' | 'archive' | 'pin' | 'read-all' | 'reveal', body: object) =>
    fetch(`/api/${path}`, { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<unknown>(r),
    ),
};
