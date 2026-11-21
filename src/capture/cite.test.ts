import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { citations, refsIn } from './cite.ts';

const ctx = { session: 's1', harness: null, cwd: null, root: null, repo: 'r', transcript: null };

function store() {
  const s = new Store(':memory:');
  s.take(
    [
      { kind: 'question', text: 'why?' },
      { kind: 'question', text: 'how?' },
    ],
    null,
    ctx,
  );
  s.settle('q-1', 'answered', 'because');
  return s;
}

describe('refsIn', () => {
  it('splits bracketed ids from bare ones, and skips ids inside longer tokens', () => {
    expect(refsIn('see [q-17] and [[T-4](http://x/?q=t-4)], also q-9, faq-3, q-5b, t-6.')).toEqual({
      cited: ['q-17', 't-4'],
      mentioned: ['q-9', 't-6'],
    });
  });

  it('cites a #slug, bare or bracketed', () => {
    expect(refsIn('per #cost-of-slugs and [#fix-it-now], not # head').cited).toEqual([
      '#cost-of-slugs',
      '#fix-it-now',
    ]);
  });

  it('ignores pasted or quoted text and repeats', () => {
    expect(refsIn('`[q-1]`\n> [q-2]\n[q-3] [q-3]').cited).toEqual(['q-3']);
  });
});

describe('citations', () => {
  it('brings in ten cited items, cuts a long answer, and points at show for the rest', () => {
    const s = new Store(':memory:');
    s.take(
      Array.from({ length: 12 }, (_, i) => ({ kind: 'question' as const, text: `n${i}?` })),
      null,
      ctx,
    );
    s.settle('q-1', 'answered', 'x'.repeat(7000));
    const out =
      citations(s, Array.from({ length: 12 }, (_, i) => `[q-${i + 1}]`).join(' '), 's9') ?? '';
    expect(out).toContain('cut at 6000 of 7000 characters');
    expect(out).toContain('[q-10]');
    expect(out).not.toContain('[q-11]');
    expect(out).toContain('also names q-11, q-12');
  });

  it('brings in a cited item once per session, and again once it is settled anew', () => {
    const s = store();
    const first = citations(s, 'about [q-1] and [q-99]', 's9') ?? '';
    expect(first).toContain('[q-1] (question, r, answered) asked: "why?"');
    expect(first).toContain('Answer: because');
    expect(first).not.toContain('q-99');
    expect(citations(s, 'again [q-1]', 's9')).toBe(
      'q-1: shown earlier this session, unchanged since.',
    );
    expect(citations(s, 'again [q-1]', 's8')).toContain('Answer: because');
    s.now = () => Date.now() + 1000;
    s.settle('q-1', 'answered', 'because, revised');
    expect(citations(s, 'again [q-1]', 's9')).toContain('because, revised');
  });

  it('points at a bare id without embedding it, and names one already shown as seen', () => {
    const s = store();
    expect(citations(s, 'like q-2 said', 's9')).toContain("read it with kouhai's `show` tool");
    expect(citations(s, 'like q-2 said', 's9')).not.toContain('how?');
    citations(s, '[q-1]', 's9');
    expect(citations(s, 'like q-1 said', 's9')).toContain('shown earlier');
    expect(citations(s, 'about q-1', 's9')).not.toContain('because');
    expect(citations(s, 'faq-1 and nothing else', 's9')).toBeNull();
  });
});
