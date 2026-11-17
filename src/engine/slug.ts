import type { Item } from './types.ts';

const MAX_WORDS = 6;
const MAX_LENGTH = 48;

/** `#cost-of-slugs`: two or more words, so it can't be a heading, a hex color, or a lone tag. */
export const SLUG = /(?<![\w#&/])#([a-z0-9]+(?:-[a-z0-9]+)+)(?![\w-])/gi;
/** `q-17` standing alone, not part of a longer token such as `faq-17` or `q-17b`. */
export const REF = /(?<![\w-])([qt]-\d+)(?![\w-])/gi;

/** A slug as stored, from whatever Claude passed (`#Cost of slugs`, `cost_of_slugs`), or null. */
export function slugOf(raw: string): string | null {
  const words = raw
    .toLowerCase()
    .replace(/^#/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  while (words.join('-').length > MAX_LENGTH && words.length > 2) words.pop();
  const slug = words.join('-').slice(0, MAX_LENGTH).replace(/-$/, '');
  return words.length >= 2 && !/^[qt]-\d+$/.test(slug) ? slug : null;
}

/** The slug a ref names (`#cost-of-slugs` or `cost-of-slugs`), or null for a numeric ref. */
export function slugRef(ref: string): string | null {
  const m = /^#?([a-z0-9]+(?:-[a-z0-9]+)+)$/i.exec(ref.trim());
  return m && !/^[qt]-\d+$/i.test(m[1] as string) ? (m[1] as string).toLowerCase() : null;
}

/** How an item is named the first time: `q-17 #cost-of-slugs`, or `q-17` without a slug. */
export const nameOf = (i: Pick<Item, 'ref' | 'slug'>) => (i.slug ? `${i.ref} #${i.slug}` : i.ref);
