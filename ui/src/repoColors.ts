import type { Repo } from './api.ts';

export const repoClass = (repo: string) => `repo-${repo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/** One rule per repo carrying its .hued colors, so chips color themselves without inline styles. */
export function repoSheet(repos: Repo[]): string {
  return repos
    .filter((r) => r.hued?.bg)
    .map((r) => `.${repoClass(r.repo)}{--repo-bg:${r.hued?.bg};--repo-fg:${r.hued?.fg || '#000'}}`)
    .join('\n');
}
