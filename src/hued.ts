import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A repo's colors and symbol, from the `.hued` file at its root (github.com/orochi235/hued). */
export type Hued = { bg: string; fg: string; icon: string };

const NONE: Hued = { bg: '', fg: '', icon: '' };
const cache = new Map<string, { mtime: number; hued: Hued }>();

export function parseHued(text: string): Hued {
  const v: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([a-z0-9]+)\s*=\s*(\S+)/.exec(line);
    if (m?.[1] && m[2]) v[m[1]] = m[2];
  }
  const color = (c: string | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '');
  return { bg: color(v.background), fg: color(v.foreground), icon: v.sfkey ?? '' };
}

/** Read once per change to the file; a repo without one gets no colors. */
export function huedOf(root: string): Hued {
  const path = join(root, '.hued');
  let mtime: number;
  try {
    mtime = statSync(path).mtimeMs;
  } catch {
    cache.delete(root);
    return NONE;
  }
  const hit = cache.get(root);
  if (hit && hit.mtime === mtime) return hit.hued;
  let hued = NONE;
  try {
    hued = parseHued(readFileSync(path, 'utf8'));
  } catch {}
  cache.set(root, { mtime, hued });
  return hued;
}
