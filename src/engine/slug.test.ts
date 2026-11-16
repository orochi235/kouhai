import { describe, expect, it } from 'vitest';
import { SLUG, slugOf, slugRef } from './slug.ts';
import { Store } from './store.ts';

const ctx = { session: 's', harness: null, cwd: null, root: null, repo: 'r', transcript: null };

describe('slugOf', () => {
  it('normalizes what Claude passes, and refuses one word or an id', () => {
    expect(slugOf('#Cost of_slugs!')).toBe('cost-of-slugs');
    expect(slugOf('slugs')).toBeNull();
    expect(slugOf('q-17')).toBeNull();
    expect(slugOf('a b c d e f g h')).toBe('a-b-c-d-e-f');
  });
});

describe('SLUG', () => {
  it('finds #slugs, not headings, anchors, colors, or one-word tags', () => {
    const found = (s: string) => [...s.matchAll(SLUG)].map((m) => m[1]);
    expect(found('see #cost-of-slugs, and [#fix-the-build]')).toEqual([
      'cost-of-slugs',
      'fix-the-build',
    ]);
    expect(found('# heading\npage.html#a-b /#c-d #fff #main')).toEqual([]);
  });
});

describe('slugRef', () => {
  it('reads a slug with or without #, and leaves ids alone', () => {
    expect(slugRef('#Cost-of-slugs')).toBe('cost-of-slugs');
    expect(slugRef('t-18')).toBeNull();
  });
});

describe('Store slugs', () => {
  it('files a slug, suffixes a taken one, and resolves either name', () => {
    const s = new Store(':memory:');
    const [a, b, c] = s.take(
      [
        { kind: 'question', text: 'how much?', slug: 'cost of slugs' },
        { kind: 'task', text: 'again', slug: 'cost-of-slugs' },
        { kind: 'question', text: 'none' },
      ],
      null,
      ctx,
    );
    expect([a?.slug, b?.slug, c?.slug]).toEqual(['cost-of-slugs', 'cost-of-slugs-2', null]);
    expect(s.get('#cost-of-slugs-2')?.ref).toBe('t-2');
    expect(s.settle('cost-of-slugs', 'answered', 'cheap')?.ref).toBe('q-1');
    expect(s.setPinned('#cost-of-slugs')?.pinned).toBe(true);
    expect(s.get('#no-such-item')).toBeNull();
  });
});
