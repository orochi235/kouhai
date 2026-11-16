import { ownWords } from '../engine/detect.ts';
import type { Store } from '../engine/store.ts';

/** Most items one prompt brings in, and how much of each answer, so a long cite can't swamp it. */
const MAX_ITEMS = 5;
const NOTE_CAP = 2000;

/**
 * The items a prompt cites in brackets: `[q-17]`, or the `[[q-17](link)]` an answer ends with. A bare
 * `q-17` is left alone, so mentioning an id in passing brings nothing in. Pasted or quoted text
 * doesn't count.
 */
export function citedRefs(prompt: string): string[] {
  const refs = [...ownWords(prompt).matchAll(/\[\[?([qt]-\d+)\]/gi)].map((m) =>
    (m[1] as string).toLowerCase(),
  );
  return [...new Set(refs)].slice(0, MAX_ITEMS);
}

/** Each cited item as context for the agent, or null when the prompt cites none that exist. */
export function citations(store: Store, prompt: string): string | null {
  const items = citedRefs(prompt).flatMap((ref) => store.get(ref) ?? []);
  if (!items.length) return null;
  const body = items.map((q) => {
    const where = [q.repo, q.outcome ?? 'still owed'].filter(Boolean).join(', ');
    const note = q.note
      ? q.note.length > NOTE_CAP
        ? `${q.note.slice(0, NOTE_CAP)}… (cut; \`dixeram show ${q.ref}\` prints the rest)`
        : q.note
      : '(none yet)';
    return `[${q.ref}] (${q.kind}, ${where}) asked: ${JSON.stringify(q.text)}\nAnswer: ${note}`;
  });
  return `The user cited ${items.length === 1 ? 'this dixeram item' : 'these dixeram items'}:\n\n${body.join('\n\n')}`;
}
