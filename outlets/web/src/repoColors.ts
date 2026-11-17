import type { Repo } from './api.ts';

export const repoClass = (repo: string) => `repo-${repo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/** Black or white, whichever reads on `bg`: for a .hued that names no foreground. */
export function inkFor(bg: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(bg.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000' : '#fff';
}

/** A project's background washed over the paper, chosen in the tint lab (2026-11-17). */
const tint = (bg: string) =>
  `light-dark(color-mix(in srgb, ${bg} 10%, transparent), color-mix(in srgb, ${bg} 17%, transparent))`;

/** The list row's wash, stronger than the reader's because it fades out across the row. */
const rowTint = (bg: string) =>
  `light-dark(color-mix(in srgb, ${bg} 24%, transparent), color-mix(in srgb, ${bg} 34%, transparent))`;

/** One rule per repo carrying its .hued colors, so chips and tints color themselves without inline styles. */
export function repoSheet(repos: Repo[]): string {
  return repos
    .flatMap((r) => (r.hued?.bg ? [{ repo: r.repo, bg: r.hued.bg, fg: r.hued.fg }] : []))
    .map(
      (r) =>
        `.${repoClass(r.repo)}{--chip-bg:${r.bg};--chip-fg:${r.fg || inkFor(r.bg)};--tint:${tint(r.bg)};--row-tint:${rowTint(r.bg)}}`,
    )
    .join('\n');
}
