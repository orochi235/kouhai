import DOMPurify from 'dompurify';
import { marked } from 'marked';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer');
  }
});

export const render = (md: string) =>
  DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true }));

const INLINE = { ALLOWED_TAGS: ['strong', 'em', 'code', 'del'], KEEP_CONTENT: true };

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
