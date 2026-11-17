import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { home } from './paths.ts';
import type { Attachment } from './types.ts';

/** Where the ledger keeps its own copies of an item's enclosures; deleted with the item. */
export const enclosureDir = (id: number) => join(home(), 'enclosures', String(id));

const WALL_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1):8787\/to\/([^/]+)\/([^/?#]+)$/;

/** The local file behind a ref that points into transom, which deletes what it holds. */
function transomFile(ref: string): string | null {
  const root = join(homedir(), 'transom');
  const m = WALL_URL.exec(ref);
  if (m?.[1] && m[2]) return join(root, 'inbox', m[1], m[2]);
  const path = ref.replace(/^file:\/\//, '');
  return path.startsWith(`${root}/`) ? path : null;
}

/** Copies `src` into the item's enclosures, or returns null when it is already gone. */
function copy(id: number, src: string): string | null {
  if (!existsSync(src)) return null;
  const dir = enclosureDir(id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, basename(src));
  copyFileSync(src, dest);
  return dest;
}

/** Swaps each transom attachment for a copy the ledger owns; one whose file is gone stays as given. */
export function keep(id: number, attachments: Attachment[]): Attachment[] {
  return attachments.map((a) => {
    const src = transomFile(a.ref) ?? (a.kind === 'transom' ? a.ref : null);
    const dest = src && copy(id, src);
    return src && dest ? { kind: 'file', ref: dest, label: a.label ?? basename(src) } : a;
  });
}

const BARE =
  /(?<=^|[\s(])(?:https?:\/\/(?:localhost|127\.0\.0\.1):8787\/to\/|(?:file:\/\/)?\/)[^\s)]+/gm;

/**
 * Points a note's references into transom at copies the ledger owns: a markdown link or image keeps
 * its text, and a bare wall URL or path becomes a link. One whose file is gone is left alone.
 */
export function keepNote(id: number, note: string): string {
  const linked = note.replace(/(\]\(\s*<?)([^\s)>]+)/g, (whole, open: string, target: string) => {
    const src = transomFile(target);
    const dest = src && copy(id, src);
    return dest ? `${open}${dest}` : whole;
  });
  return linked.replace(BARE, (whole) => {
    const [, ref = whole, tail = ''] = /^(.*?)([.,;:!?]*)$/.exec(whole) ?? [];
    const src = transomFile(ref);
    const dest = src && copy(id, src);
    return dest ? `[${basename(dest)}](${dest})${tail}` : whole;
  });
}

export const dropEnclosures = (id: number) =>
  rmSync(enclosureDir(id), { recursive: true, force: true });
