// Questions answered and waiting for the daemon's tidy pass: a clean title for one the chat filed,
// a verdict, and whether its answer is worth keeping past the session.
import type { DatabaseSync } from 'node:sqlite';

/** An answered question the tidy pass has not seen. */
export type Untriaged = {
  id: number;
  harness: string | null;
  /** True when the chat filed it, so its text is only a provisional title. */
  chat: boolean;
  asked: string;
  text: string;
  note: string;
  scope: string | null;
};

/** What the tidy pass decided about one question. */
export type Triage = { id: number; question?: string; verdict?: string; keep: boolean };

/** How long a chat-filed item waits for its title before adapters hear of it anyway. */
export const TITLE_WAIT_MS = 30 * 60 * 1000;

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * The question in `asked` that the slug's words name best: of its sentences ending in `?`, the
 * one sharing most words with the slug, or the whole message when none ends in `?`.
 */
export function provisionalTitle(asked: string, slug: string): string {
  const want = new Set(words(slug).filter((w) => w.length > 2));
  const asks = asked
    .split(/(?<=\?)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith('?'));
  let best = '';
  let score = -1;
  for (const s of asks) {
    const n = words(s).filter((w) => want.has(w)).length;
    if (n > score) [best, score] = [s, n];
  }
  const title = best || asked.trim();
  return title.length > 300 ? `${title.slice(0, 299)}…` : title;
}

/** Answered questions raised since `since` that the tidy pass has not seen, oldest first. */
export function untriaged(db: DatabaseSync, since: number, limit = 20): Untriaged[] {
  const rows = db
    .prepare(
      `SELECT id, harness, via, coalesce(asked, prompt, text) AS asked, text, note, scope FROM items
       WHERE kind = 'question' AND outcome = 'answered' AND triaged_at IS NULL AND misfiled_at IS NULL
         AND raised_at >= ? ORDER BY id LIMIT ?`,
    )
    .all(since, limit) as Record<string, string | number | null>[];
  return rows.map((r) => ({
    id: Number(r.id),
    harness: r.harness == null ? null : String(r.harness),
    chat: r.via === 'chat',
    asked: String(r.asked ?? ''),
    text: String(r.text),
    note: String(r.note ?? ''),
    scope: r.scope == null ? null : String(r.scope),
  }));
}

/**
 * Records a tidy pass. A chat-filed question takes the cleaner title; a verdict or scope the
 * agent already gave is kept.
 */
export function applyTriage(db: DatabaseSync, now: number, t: Triage) {
  db.prepare(
    `UPDATE items SET
       text = CASE WHEN via = 'chat' AND ? IS NOT NULL THEN ? ELSE text END,
       verdict = coalesce(verdict, ?),
       scope = coalesce(scope, ?),
       triaged_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    t.question ?? null,
    t.question ?? null,
    t.verdict ?? null,
    t.keep ? null : 'session',
    now,
    now,
    t.id,
  );
}

/** Marks questions seen without changing them, so a failing pass does not retry them forever. */
export function skipTriage(db: DatabaseSync, now: number, ids: number[]) {
  const mark = db.prepare('UPDATE items SET triaged_at = ? WHERE id = ?');
  for (const id of ids) mark.run(now, id);
}

/** Records the user's message on an item the chat filed, for the tidy pass to quote from. */
export function setAsked(db: DatabaseSync, id: number, asked: string) {
  db.prepare('UPDATE items SET asked = ? WHERE id = ?').run(asked, id);
}
