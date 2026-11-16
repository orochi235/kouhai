import { ownWords } from '../engine/detect.ts';
import type { Store } from '../engine/store.ts';
import type { Item } from '../engine/types.ts';

/** Most items one prompt brings in, and how much of each answer, so a long cite can't swamp it. */
const MAX_ITEMS = 10;
const NOTE_CAP = 6000;

/** `[q-17]`, or the `[[q-17](link)]` an answer ends with. */
const CITED = /\[\[?([qt]-\d+)\]/gi;
/** `q-17` standing alone, not part of a longer token such as `faq-17` or `q-17b`. */
const BARE = /(?<![\w-])([qt]-\d+)(?![\w-])/gi;

const unique = (refs: string[]) => [...new Set(refs.map((r) => r.toLowerCase()))];

/**
 * The ids a prompt names in the user's own words: `cited` in brackets, which come in whole, and
 * `mentioned` bare, which the agent reads with `show` if it takes them for dixeram items.
 */
export function refsIn(prompt: string): { cited: string[]; mentioned: string[] } {
  const own = ownWords(prompt);
  const cited = unique([...own.matchAll(CITED)].map((m) => m[1] as string));
  const mentioned = unique([...own.matchAll(BARE)].map((m) => m[1] as string)).filter(
    (r) => !cited.includes(r),
  );
  return { cited, mentioned };
}

/** One item as the agent reads it: in full from the `show` tool, its answer cut at `cap` in a prompt. */
export function itemText(q: Item, cap = Infinity): string {
  const where = [q.repo, q.outcome ?? 'still owed'].filter(Boolean).join(', ');
  const note = !q.note
    ? '(none yet)'
    : q.note.length > cap
      ? `${q.note.slice(0, cap)}… (cut at ${cap} of ${q.note.length} characters; dixeram's \`show\` tool returns all of it)`
      : q.note;
  return `[${q.ref}] (${q.kind}, ${where}) asked: ${JSON.stringify(q.text)}\nAnswer: ${note}`;
}

/** Marks this answer of `q` shown to a session; false when it already was. A new settlement shows again. */
export function markShown(store: Store, session: string | null, q: Item): boolean {
  return !session || store.chaseOnce(`shown:${session}:${q.ref}:${q.settledAt ?? 'owed'}`);
}

const shownBefore = (store: Store, session: string | null, q: Item) =>
  !!session && store.chased(`shown:${session}:${q.ref}:${q.settledAt ?? 'owed'}`);

/** What a prompt's ids add to its context, or null for a prompt naming none that exist. */
export function citations(store: Store, prompt: string, session: string | null): string | null {
  const { cited, mentioned } = refsIn(prompt);
  const found = cited.flatMap((ref) => store.get(ref) ?? []);
  const items = found.slice(0, MAX_ITEMS);
  const over = found.slice(MAX_ITEMS);
  const fresh = items.filter((q) => markShown(store, session, q));
  const named = mentioned.flatMap((ref) => store.get(ref) ?? []);
  const seen = [
    ...items.filter((q) => !fresh.includes(q)),
    ...named.filter((q) => shownBefore(store, session, q)),
  ];
  const unseen = [...over, ...named.filter((q) => !seen.includes(q))];
  const parts = [
    fresh.length &&
      `The user cited ${fresh.length === 1 ? 'this dixeram item' : 'these dixeram items'}:\n\n${fresh.map((q) => itemText(q, NOTE_CAP)).join('\n\n')}`,
    seen.length &&
      `${seen.map((q) => q.ref).join(', ')}: shown earlier this session, unchanged since.`,
    unseen.length &&
      `The prompt also names ${unseen.map((q) => q.ref).join(', ')}; if it means ${unseen.length === 1 ? 'that dixeram item' : 'those dixeram items'}, read ${unseen.length === 1 ? 'it' : 'them'} with dixeram's \`show\` tool.`,
  ].filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}
