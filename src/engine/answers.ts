// The answers a turn gave in chat, found by the id or slug each one ends with.
import type { RefScheme } from './refs.ts';
import { isMidTurn, isPrompt, type Line, tail } from './transcript.ts';
import type { Settlement } from './types.ts';

/**
 * Something the chat answered. `ref` names an item `take` filed; `slug` alone is a question
 * the chat filed itself, following `parent` when the tag names one. `asked` is the user's
 * message the answer followed.
 */
export type Answer = {
  ref?: string;
  slug?: string;
  parent?: string;
  note: string;
  extra: Settlement;
  asked: string;
};

type Item = {
  slug?: unknown;
  outcome?: unknown;
  verdict?: unknown;
  basis?: unknown;
  scope?: unknown;
};
type Block = {
  type?: string;
  id?: string;
  name?: string;
  text?: string;
  input?: { items?: Item[] };
  tool_use_id?: string;
  content?: unknown;
};

const isTake = (name = '') => /(?:kouhai|dixeram).*__take$/.test(name);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const TURN = /kouhai, turn "(turn-[0-9a-f]+)"/;

const textOf = (c: unknown) =>
  typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? (c as unknown[])
          .map((t) => (typeof t === 'string' ? t : String((t as { text?: unknown }).text ?? '')))
          .join('\n')
      : '';

/**
 * What the chat in the transcript's last turn answered, and the turn id kouhai gave it. An
 * answer is the paragraphs of one text block that end with a tag (`[q-17]`, `[[q-17](link)]`,
 * `[#slug]`, or `[#slug ^q-17]` for a follow-up), back to the previous tag or the block's start,
 * with the tag and any "Filed …" sentence taken out. A slug given to `take` maps to the ref it
 * was filed under, which differs when the slug was taken, with what `take` said beyond the text.
 */
export function answersIn(
  path: string,
  refs: RefScheme,
): { turn: string | null; answers: Answer[] } {
  const lines = tail(path);
  let start = 0;
  for (let i = lines.length - 1; i >= 0; i--)
    if (isPrompt(lines[i] as Line)) {
      start = i;
      break;
    }
  const asked = new Map<string, Item[]>();
  const refOfSlug = new Map<string, string>();
  const extraOf = new Map<string, Settlement>();
  const filed = new RegExp(`^${refs.source}(?: #([a-z0-9-]+))?`, 'i');
  const texts: { text: string; heard: string }[] = [];
  let heard = '';
  let turn: string | null = null;
  lines.forEach((l, i) => {
    if (isPrompt(l)) heard = String(l.message?.content ?? '');
    if (isMidTurn(l)) heard = String(l.attachment?.prompt ?? '');
    if (i >= start && l.attachment?.type === 'hook_additional_context') {
      const m = TURN.exec(textOf([l.attachment.content].flat()));
      if (m) turn = m[1] as string;
    }
    const content = (l.message?.content ?? []) as Block[];
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (l.type === 'assistant' && b.type === 'tool_use' && b.id && isTake(b.name))
        asked.set(b.id, b.input?.items ?? []);
      if (l.type === 'assistant' && b.type === 'text' && b.text && i > start)
        texts.push({ text: b.text, heard });
      if (l.type !== 'user' || b.type !== 'tool_result' || !b.tool_use_id) continue;
      const items = asked.get(b.tool_use_id);
      const body = textOf(b.content);
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
  const tag = new RegExp(
    `\\[\\[?(${refs.source}|#[a-z0-9-]+)(?:\\s+\\^(${refs.source}))?(?:\\]\\([^)]*\\))?\\]`,
    'gi',
  );
  const filedLine = new RegExp(`^\\s*Filed (?:${refs.source}|#)[^.\\n]*\\.[ \\t]*\\n?`, 'gim');
  const out: Answer[] = [];
  for (const { text, heard } of texts) {
    let acc: string[] = [];
    for (const para of text.split(/\n{2,}/)) {
      // Odd pieces are inside code spans, where a tag is only an example of one.
      const pieces = para.replace(filedLine, '').split('`');
      const tags = pieces.flatMap((t, n) => (n % 2 ? [] : [...t.matchAll(tag)]));
      acc.push(
        pieces
          .map((t, n) => (n % 2 ? t : t.replace(tag, '')))
          .join('`')
          .trimEnd(),
      );
      if (!tags.length) continue;
      const note = acc.filter(Boolean).join('\n\n').trim();
      acc = [];
      if (!note) continue;
      for (const m of tags) {
        const c = m[1] as string;
        if (!c.startsWith('#')) {
          out.push({ ref: c, note, extra: extraOf.get(c.toLowerCase()) ?? {}, asked: heard });
          continue;
        }
        const slug = c.slice(1).toLowerCase();
        const ref = refOfSlug.get(slug);
        out.push(
          ref
            ? { ref, note, extra: extraOf.get(ref.toLowerCase()) ?? {}, asked: heard }
            : { slug, ...(m[3] ? { parent: m[3] } : {}), note, extra: {}, asked: heard },
        );
      }
    }
  }
  return { turn, answers: out };
}
