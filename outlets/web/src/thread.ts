import type { Item } from './api.ts';

export type Row = { item: Item; reply: boolean };

/**
 * The list in thread order: each thread sits where its newest item would, its first question
 * on top and every follow-up beneath it, oldest first. A follow-up whose parent isn't listed
 * stands alone.
 */
export function thread(items: Item[]): Row[] {
  const byRef = new Map(items.map((i) => [i.ref, i]));
  const rootOf = (i: Item): Item => {
    const seen = new Set<string>();
    let at = i;
    while (at.parent && byRef.has(at.parent) && !seen.has(at.ref)) {
      seen.add(at.ref);
      at = byRef.get(at.parent) as Item;
    }
    return at;
  };
  const groups = new Map<string, Item[]>();
  for (const i of items) {
    const root = rootOf(i).ref;
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.entries()].flatMap(([root, g]) => {
    const head = byRef.get(root) as Item;
    const replies = g.filter((i) => i !== head).sort((a, b) => a.raisedAt - b.raisedAt);
    return [{ item: head, reply: false }, ...replies.map((item) => ({ item, reply: true }))];
  });
}
