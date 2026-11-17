import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { home } from './paths.ts';
import type { Attachment } from './types.ts';

/** Where the ledger keeps its own copies of an item's enclosures; deleted with the item. */
export const enclosureDir = (id: number) => join(home(), 'enclosures', String(id));

const WALL_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1):8787\/to\/([^/]+)\/([^/?#]+)$/;

/** The local file behind an attachment that points into transom, which deletes what it holds. */
function transient(a: Attachment): string | null {
  const root = join(homedir(), 'transom');
  const m = WALL_URL.exec(a.ref);
  if (m?.[1] && m[2]) return join(root, 'inbox', m[1], m[2]);
  if (a.kind !== 'transom' && a.kind !== 'file') return null;
  const path = a.ref.replace(/^file:\/\//, '');
  return a.kind === 'transom' || path.startsWith(`${root}/`) ? path : null;
}

/** Swaps each transom attachment for a copy the ledger owns; one whose file is gone stays as given. */
export function keep(id: number, attachments: Attachment[]): Attachment[] {
  return attachments.map((a) => {
    const src = transient(a);
    if (!src || !existsSync(src)) return a;
    const dir = enclosureDir(id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, basename(src));
    copyFileSync(src, dest);
    return { kind: 'file', ref: dest, label: a.label ?? basename(src) };
  });
}

export const dropEnclosures = (id: number) =>
  rmSync(enclosureDir(id), { recursive: true, force: true });
