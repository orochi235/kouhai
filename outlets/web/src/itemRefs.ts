import type { RefScheme } from '@core/refs.ts';
import { SLUG } from '@core/slug.ts';
import type { MarkedExtension } from 'marked';

/** `q-17`, as `refs` writes it, and `#cost-of-slugs` in a note's prose, as links that open the item. */
export function itemRefsFor(refs: RefScheme): MarkedExtension {
  const ref = refs.inProse('').source;
  const NEXT_REF = new RegExp(`${ref}|${SLUG.source}`, 'i');
  const HEAD_REF = new RegExp(`^(?:${ref}|${SLUG.source})`, 'i');
  return {
    extensions: [
      {
        name: 'itemRef',
        level: 'inline',
        start: (src) => {
          const i = src.search(NEXT_REF);
          return i < 0 ? undefined : i;
        },
        tokenizer(src, tokens) {
          // Marked can try this mid-word, where the patterns' lookbehinds see only the cut.
          if (this.lexer.state.inLink || /[\w#&/-]$/.test(tokens.at(-1)?.raw ?? '')) return;
          const m = HEAD_REF.exec(src);
          if (m) return { type: 'itemRef', raw: m[0], ref: m[1] ?? `#${m[2]}` };
        },
        renderer: (t) =>
          `<a class="item-ref" href="?q=${encodeURIComponent(t.ref)}" data-ref="${t.ref}">${t.raw}</a>`,
      },
    ],
  };
}
