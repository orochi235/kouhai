import { port } from './paths.ts';
import type { Question } from './types.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the menu bar item shows. perch draws these strings verbatim. */
export function menu(counts: { unread: number; waiting: number }, unread: Question[]) {
  const base = `http://localhost:${port()}`;
  const title =
    counts.unread === 0
      ? 'No unread answers'
      : `${counts.unread} unread ${counts.unread === 1 ? 'answer' : 'answers'}`;
  return {
    title,
    unread: counts.unread,
    waiting: counts.waiting,
    waitingText:
      counts.waiting === 0
        ? ''
        : `${counts.waiting} ${counts.waiting === 1 ? 'question' : 'questions'} still being answered`,
    inbox: base,
    rows: unread.map((q) => ({
      id: q.ref,
      text: clip(q.question, 60),
      repo: q.repo ?? '',
      url: `${base}/?q=${q.ref}`,
    })),
  };
}
