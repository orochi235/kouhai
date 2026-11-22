// The answers a turn gave in chat, found by the id or slug each one ends with.
import type { RefScheme } from './refs.ts';
import { isPrompt, type Line, tail } from './transcript.ts';
import type { Settlement } from './types.ts';

/** An item the chat answered: its ref (or the `#slug` it was cited by) and the answer. */
export type Answer = { ref: string; note: string; extra: Settlement };

type Block = {
  type?: string;
  id?: string;
  name?: string;
  text?: string;
  input?: {
    items?: {
      slug?: unknown;
      outcome?: unknown;
      verdict?: unknown;
      basis?: unknown;
      scope?: unknown;
    }[];
  };
  tool_use_id?: string;
  content?: unknown;
};

const isTake = (name = '') => /(?:kouhai|dixeram).*__take$/.test(name);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

const resultText = (c: unknown) =>
  typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? (c as { text?: unknown }[]).map((t) => String(t.text ?? '')).join('\n')
      : '';

/**
 * What the chat in the transcript's last turn answered. An answer is the paragraphs of one text
 * block that end with a citation (`[q-17]`, `[[q-17](link)]`, or `[#slug]` naming a slug given to
 * `take`), back to the previous citation or the block's start, with the citation and any
 * "Filed …" sentence taken out. Slugs are mapped to the refs `take` gave them, which differ when the
 * slug was taken; what each `take` said beyond the text (verdict, basis, scope) comes along.
 */
export function answersIn(path: string, refs: RefScheme): Answer[] {
  const lines = tail(path);
  let start = 0;
  for (let i = lines.length - 1; i >= 0; i--)
    if (isPrompt(lines[i] as Line)) {
      start = i;
      break;
    }
  const asked = new Map<string, NonNullable<Block['input']>['items']>();
  const refOfSlug = new Map<string, string>();
  const extraOf = new Map<string, Settlement>();
  const filed = new RegExp(`^${refs.source}(?: #([a-z0-9-]+))?`, 'i');
  const texts: string[] = [];
  lines.forEach((l, i) => {
    const content = (l.message?.content ?? []) as Block[];
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (l.type === 'assistant' && b.type === 'tool_use' && b.id && isTake(b.name))
        asked.set(b.id, b.input?.items ?? []);
      if (l.type === 'assistant' && b.type === 'text' && b.text && i > start) texts.push(b.text);
      if (l.type !== 'user' || b.type !== 'tool_result' || !b.tool_use_id) continue;
      const items = asked.get(b.tool_use_id);
      const body = resultText(b.content);
      if (!items || !/^Filed in the (?:kouhai|dixeram) ledger:/.test(body)) continue;
      body
        .split('\n')
        .slice(1)
        .forEach((row, n) => {
          const m = filed.exec(row);
          const item = items[n];
          if (!m || !item) return;
          const ref = m[1] as string;
          const slug = str(item.slug);
          if (slug) refOfSlug.set(slug.toLowerCase(), ref);
          if (!item.outcome)
            extraOf.set(ref.toLowerCase(), {
              verdict: str(item.verdict) ?? null,
              basis: (str(item.basis) as Settlement['basis']) ?? null,
              scope: (str(item.scope) as Settlement['scope']) ?? null,
            });
        });
    }
  });
  const cite = new RegExp(`\\[\\[?(${refs.source}|#[a-z0-9-]+)(?:\\]\\([^)]*\\))?\\]`, 'gi');
  const filedLine = new RegExp(`^\\s*Filed (?:${refs.source}|#)[^.\\n]*\\.[ \\t]*\\n?`, 'gim');
  const out: Answer[] = [];
  for (const text of texts) {
    let acc: string[] = [];
    for (const para of text.split(/\n{2,}/)) {
      // Odd pieces are inside code spans, where a citation is only an example of one.
      const pieces = para.replace(filedLine, '').split('`');
      const cited = pieces.flatMap((t, n) =>
        n % 2 ? [] : [...t.matchAll(cite)].map((m) => m[1] as string),
      );
      acc.push(
        pieces
          .map((t, n) => (n % 2 ? t : t.replace(cite, '')))
          .join('`')
          .trimEnd(),
      );
      if (!cited.length) continue;
      const note = acc.filter(Boolean).join('\n\n').trim();
      acc = [];
      if (!note) continue;
      for (const c of cited) {
        const ref = c.startsWith('#') ? refOfSlug.get(c.slice(1).toLowerCase()) : c;
        if (ref) out.push({ ref, note, extra: extraOf.get(ref.toLowerCase()) ?? {} });
      }
    }
  }
  return out;
}
