import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { Marked, marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { localImages } from './images.ts';
import { itemRefsFor } from './itemRefs.ts';
import { refScheme } from './refs.ts';

// A block names its language to be highlighted; an unnamed one stays plain, since guessing colors
// prose and tables wrongly. Mermaid blocks are left for `drawDiagrams`.
const highlight = markedHighlight({
  langPrefix: 'hljs language-',
  highlight: (code, lang) =>
    lang && lang !== 'mermaid' && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang }).value
      : code,
});

let built = refScheme();
let itemRefs = itemRefsFor(built);
let plain = new Marked(highlight, itemRefs);

/** Rebuilds the ref links when the page has taken the ledger's ref format since the last render. */
function follow() {
  if (built === refScheme()) return;
  built = refScheme();
  itemRefs = itemRefsFor(built);
  plain = new Marked(highlight, itemRefs);
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && !node.hasAttribute('data-ref')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer');
  }
});

/** A note as HTML; given the item's ref, its local images load from the daemon. */
export const render = (md: string, ref?: string) => {
  follow();
  return DOMPurify.sanitize(
    // A per-call `walkTokens` would replace the highlighter's, so the image hook joins it in its own instance.
    (ref ? new Marked(highlight, itemRefs, { walkTokens: localImages(ref) }) : plain).parse(md, {
      async: false,
      gfm: true,
    }),
  );
};

const INLINE = { ALLOWED_TAGS: ['strong', 'em', 'code', 'del'], KEEP_CONTENT: true };

/** One line of inline markdown, such as a verdict or an item's text, keeping only inline styling. */
export const renderInline = (md: string) =>
  DOMPurify.sanitize(marked.parseInline(md, { async: false, gfm: true }), INLINE);

/**
 * A note's opening as one line of inline markdown, for a list row. Links keep only their text,
 * since the whole row is the click target; blocks flatten to their words.
 */
export const renderPreview = (md: string, max = 240) =>
  DOMPurify.sanitize(
    marked.parseInline(
      md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max),
      { async: false, gfm: true },
    ),
    INLINE,
  );
