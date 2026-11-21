import { RefScheme } from '@core/refs.ts';
import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { itemRefsFor } from './itemRefs.ts';

const md = (s: string, refs = new RefScheme()) =>
  new Marked(itemRefsFor(refs)).parseInline(s, { async: false });

describe('itemRefsFor', () => {
  it('links refs in the configured format too', () => {
    expect(md('see KOU-3.', new RefScheme({ question: 'KOU-Q{n}', task: 'KOU-{n}' }))).toBe(
      'see <a class="item-ref" href="?q=KOU-3" data-ref="KOU-3">KOU-3</a>.',
    );
  });

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
