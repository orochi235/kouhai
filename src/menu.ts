import { port } from './paths.ts';
import type { Item } from './types.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the menu bar item shows. perch draws these strings verbatim. */
export function menu(counts: { unread: number; owed: number }, unread: Item[], owed: Item[]) {
  const base = `http://localhost:${port()}`;
  const row = (i: Item) => ({
    id: i.ref,
    text: `${i.ref}  ${clip(i.text, 56)}`,
    repo: i.repo ?? '',
    url: `${base}/?q=${i.ref}`,
  });
  return {
    title:
      counts.unread === 0
        ? 'Nothing unread'
        : `${plural(counts.unread, 'settled item', 'settled items')} unread`,
    unread: counts.unread,
    owed: counts.owed,
    owedText: counts.owed === 0 ? '' : `${plural(counts.owed, 'item', 'items')} still owed`,
    inbox: base,
    rows: unread.map(row),
    owedRows: owed.map(row),
  };
}
