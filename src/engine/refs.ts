import type { Kind } from './types.ts';

/** How each kind's ref is written: a template holding `{n}`, the item's number. */
export type RefFormat = Record<Kind, string>;

export const DEFAULT_REFS: RefFormat = { question: 'q-{n}', task: 't-{n}' };

const TEMPLATE = /^[A-Za-z0-9._-]*\{n\}[A-Za-z0-9._-]*$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sourceOf = (template: string) => template.split('{n}').map(escape).join('\\d+');

/** `v` as a ref format, or a throw saying what is wrong with it. */
export function requireRefFormat(v: unknown): RefFormat {
  const f = v as Partial<RefFormat> | null;
  for (const kind of ['question', 'task'] as const) {
    const t = f?.[kind];
    if (typeof t !== 'string' || !TEMPLATE.test(t))
      throw new Error(`refs.${kind} must hold {n} once, among letters, digits, '.', '_' and '-'`);
  }
  return { question: f?.question as string, task: f?.task as string };
}

/**
 * Writes and reads refs. Reading always accepts the default `q-17` / `t-17` too, so a note,
 * transcript or citation written before the format changed still names its item.
 */
export class RefScheme {
  readonly format: RefFormat;
  /** Matches one ref, case-insensitively, in its single capture group. */
  readonly source: string;
  /** One per distinct template, capturing the number. */
  private readonly parsers: RegExp[];

  constructor(format: RefFormat = DEFAULT_REFS) {
    this.format = format;
    const templates = [...new Set([...Object.values(format), ...Object.values(DEFAULT_REFS)])];
    // Longest first, so `kq-{n}` is tried before `q-{n}` could match its tail.
    const alts = templates.map(sourceOf).sort((a, b) => b.length - a.length);
    this.source = `(${alts.join('|')})`;
    this.parsers = templates.map(
      (t) => new RegExp(`^${t.split('{n}').map(escape).join('(\\d+)')}$`, 'i'),
    );
  }

  refOf(kind: Kind, n: number): string {
    return this.format[kind].replace('{n}', String(n));
  }

  /** The number a ref names: any kind's ref in this format or the default one, or the bare number. */
  idOf(ref: string | number): number | null {
    if (typeof ref === 'number') return Number.isInteger(ref) ? ref : null;
    const s = ref.trim();
    if (/^\d+$/.test(s)) return Number(s);
    for (const p of this.parsers) {
      const m = p.exec(s);
      if (m) return Number(m[1]);
    }
    return null;
  }

  /** The kind a ref's form names, or null for a bare number or a form both kinds share. */
  kindOf(ref: string): Kind | null {
    const s = ref.trim();
    for (const format of [this.format, DEFAULT_REFS]) {
      const hits = (['question', 'task'] as const).filter((k) =>
        new RegExp(`^${sourceOf(format[k])}$`, 'i').test(s),
      );
      if (hits.length) return hits.length === 1 ? (hits[0] as Kind) : null;
    }
    return null;
  }

  /** A pattern for refs standing alone in prose, not inside a longer token like `faq-17`. */
  inProse(flags = 'gi'): RegExp {
    return new RegExp(`(?<![\\w-])${this.source}(?![\\w-])`, flags);
  }
}
