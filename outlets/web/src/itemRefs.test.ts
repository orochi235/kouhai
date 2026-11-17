import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { itemRefs } from './itemRefs.ts';

const md = (s: string) => new Marked(itemRefs).parseInline(s, { async: false });

describe('itemRefs', () => {
  it('links ids and slugs in prose', () => {
    expect(md('see q-17 and #cost-of-slugs.')).toBe(
      'see <a class="item-ref" href="?q=q-17" data-ref="q-17">q-17</a> and <a class="item-ref" href="?q=%23cost-of-slugs" data-ref="#cost-of-slugs">#cost-of-slugs</a>.',
    );
  });

  it('leaves code, links, longer tokens, and URL fragments alone', () => {
    for (const s of [
      '`q-17`',
      '[q-17](http://x)',
      'faq-17 q-17b',
      'http://x.com/a#foo-bar',
      'a#foo-bar',
    ])
      expect(md(s)).not.toContain('item-ref');
  });
});
