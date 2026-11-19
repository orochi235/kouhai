// /btw side questions run no hook and reach no transcript; Claude Code's prompt history is the one
// place they land, so they are filed from there and answered later by the session that saw them.
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { contextOf } from '../engine/context.ts';
import type { Store } from '../engine/store.ts';
import type { Item } from '../engine/types.ts';

const BTW = /^\/btw\s+([\s\S]+)$/;

/** Every Claude config directory here that keeps a prompt history. */
export function configDirs(home = homedir()): string[] {
  return readdirSync(home)
    .filter((n) => /^\.claude(-[\w-]+)?$/.test(n))
    .map((n) => join(home, n))
    .filter((d) => existsSync(join(d, 'history.jsonl')));
}

/** The bytes of `path` from `from` to its end. */
function tail(path: string, from: number): { text: string; size: number } {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = from > size ? 0 : from;
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return { text: buf.toString('utf8'), size };
  } finally {
    closeSync(fd);
  }
}

/**
 * Files each /btw asked since the last look at `configDir`'s history as a question owed by its
 * session. The first look only marks the end: old side questions belong to sessions long gone.
 */
export function fileBtws(store: Store, configDir: string): Item[] {
  const path = join(configDir, 'history.jsonl');
  if (!existsSync(path)) return [];
  return store.advance(`history:${path}`, (at) => {
    if (at == null) return { at: statSync(path).size, out: [] };
    const { text, size } = tail(path, at);
    // A line still being written is left for the next look.
    const whole = text.slice(0, text.lastIndexOf('\n') + 1);
    const filed: Item[] = [];
    for (const line of whole.split('\n')) {
      if (!line.includes('/btw')) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const m = typeof entry.display === 'string' ? BTW.exec(entry.display.trim()) : null;
      if (!m) continue;
      const ctx = contextOf({ session: entry.sessionId, cwd: entry.project, configDir });
      if (answeredAside(store, ctx.session, m[1] as string)) continue;
      filed.push(
        ...store.take([{ kind: 'question', text: m[1] as string, via: 'btw' }], null, ctx),
      );
    }
    const read = Buffer.byteLength(whole);
    return { at: (at > size ? 0 : at) + read, out: filed };
  });
}

/** Whether the mod already caught this /btw and filed its answer, which history records all the same. */
function answeredAside(store: Store, session: string | null, text: string): boolean {
  if (!session) return false;
  return store.list('all', { session }).some((i) => i.via === 'btw' && i.text === text.trim());
}

/** This session's /btw questions not yet put to its agent; each is put once, by whichever hook comes first. */
export function untoldBtws(store: Store, session: string): Item[] {
  return store
    .list('owed', { session })
    .filter((i) => i.via === 'btw')
    .filter((i) => store.chaseOnce(`btw-told:${i.ref}`));
}

/** Asks the agent to settle side questions it never saw. */
export function btwRule(items: Item[]): string {
  const list = items.map((i) => `${i.ref} "${i.text}"`).join('; ');
  return (
    `The user asked ${items.length === 1 ? 'this' : 'these'} with /btw, which you never saw: ${list}. ` +
    'The answer they got was shown once and kept nowhere. Settle each with `settle` (`basis` and `scope` too), ' +
    'in a note that stands on its own, drawing on what this session knows; no need to answer in chat.'
  );
}
