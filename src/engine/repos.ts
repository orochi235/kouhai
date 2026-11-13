import { huedOf } from './hued.ts';
import type { Item } from './types.ts';

export type RepoSummary = {
  repo: string;
  root: string | null;
  unread: number;
  owed: number;
  total: number;
  /** The repo's colors and symbol from its `.hued`, when it has one. */
  hued: { bg: string; fg: string; icon: string } | null;
};

/** Every repo with an item among `all`, busiest first. */
export function repos(all: Item[]): RepoSummary[] {
  const by = new Map<string, Omit<RepoSummary, 'hued'>>();
  for (const q of all) {
    if (!q.repo) continue;
    const r = by.get(q.repo) ?? { repo: q.repo, root: q.root, unread: 0, owed: 0, total: 0 };
    r.total++;
    if (q.outcome && !q.readAt) r.unread++;
    if (!q.outcome) r.owed++;
    by.set(q.repo, r);
  }
  return [...by.values()]
    .sort((a, b) => b.unread + b.owed - (a.unread + a.owed) || a.repo.localeCompare(b.repo))
    .map((r) => ({ ...r, hued: r.root ? huedOf(r.root) : null }));
}
