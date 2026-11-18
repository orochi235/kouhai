// What a settled answer pins down about its repo, and whether that has moved since.
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';

const git = (root: string, args: string[]) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 2000 });
  return r.status === 0 ? r.stdout : null;
};

/** The commit checked out at `root`, or null outside a repo. */
export function headOf(root: string): string | null {
  return git(root, ['rev-parse', 'HEAD'])?.trim() || null;
}

/** Markdown link targets that are absolute paths: `](/abs/file.ts:42)` or `](file:///abs/file.ts)`. */
const LINK = /\]\((?:file:\/\/)?(\/[^)\s#]+)\)/g;

/** The files under `root` a note links, relative to it, each once. */
export function citesIn(note: string, root: string): string[] {
  const out = new Set<string>();
  for (const m of note.matchAll(LINK)) {
    const path = decodeURI(m[1] as string).replace(/:\d+(:\d+)?$/, '');
    const rel = relative(root, path);
    if (rel && !rel.startsWith('..') && !rel.startsWith('/')) out.add(rel);
  }
  return [...out];
}

/** Which of `files` differ now (committed or not) from `head`; null when git can't say. */
export function changedSince(root: string, head: string, files: string[]): string[] | null {
  if (!files.length) return [];
  const out = git(root, ['diff', '--name-only', head, '--', ...files]);
  return out == null ? null : out.split('\n').filter(Boolean);
}

/** The cited files that changed since an answer was settled; empty when none did or it can't be told. */
export function staleCites(q: {
  root: string | null;
  head: string | null;
  cites: string[];
  scope: string | null;
}): string[] {
  if (!q.root || !q.head || !q.cites.length || q.scope === 'session') return [];
  return changedSince(q.root, q.head, q.cites) ?? [];
}
