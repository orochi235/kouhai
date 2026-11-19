// A side question the dixeram mod answered by forking the live session (/ask, or /btw it caught),
// filed already settled so the answer outlives the overlay it was shown in.
import { contextOf } from '../engine/context.ts';
import type { Store } from '../engine/store.ts';
import type { Item, Via } from '../engine/types.ts';

export type Aside = {
  session: string;
  cwd: string;
  question: string;
  answer: string;
  via: Via;
  /** The fork's token counts, kept so the cost can be measured later. */
  usage?: Record<string, unknown>;
};

export function fileAside(store: Store, a: Aside, configDir?: string): Item {
  const ctx = contextOf({ session: a.session, cwd: a.cwd, configDir });
  const [item] = store.take([{ kind: 'question', text: a.question, via: a.via }], null, ctx);
  if (!item) throw new Error('an aside needs a question');
  return store.settle(item.id, 'answered', a.answer, [], {}, a.usage ?? null) as Item;
}

/** Reads an aside from JSON, refusing one missing a field. */
export function asideOf(json: string): Aside {
  const v = JSON.parse(json) as Record<string, unknown>;
  for (const k of ['session', 'cwd', 'question', 'answer'])
    if (typeof v[k] !== 'string' || !(v[k] as string).trim()) throw new Error(`aside needs ${k}`);
  return {
    session: v.session as string,
    cwd: v.cwd as string,
    question: (v.question as string).trim(),
    answer: v.answer as string,
    via: v.via === 'btw' ? 'btw' : 'ask',
    usage:
      v.usage && typeof v.usage === 'object' ? (v.usage as Record<string, unknown>) : undefined,
  };
}
