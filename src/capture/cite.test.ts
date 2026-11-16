import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { citations, citedRefs } from './cite.ts';

const ctx = { session: 's1', harness: null, cwd: null, root: null, repo: 'r', transcript: null };

describe('citedRefs', () => {
  it('takes bracketed ids and answer-style links, and leaves bare ids alone', () => {
    expect(citedRefs('see [q-17] and [[T-4](http://localhost:8771/?q=t-4)], not q-9')).toEqual([
      'q-17',
      't-4',
    ]);
  });

  it('ignores pasted or quoted text, repeats, and anything past five', () => {
    expect(citedRefs('`[q-1]`\n> [q-2]\n[q-3] [q-3]')).toEqual(['q-3']);
    expect(citedRefs('[q-1][q-2][q-3][q-4][q-5][q-6]')).toHaveLength(5);
  });
});

describe('citations', () => {
  it('brings in each cited item that exists, with its answer', () => {
    const s = new Store(':memory:');
    s.take([{ kind: 'question', text: 'why?' }], null, ctx);
    s.settle('q-1', 'answered', 'because');
    const out = citations(s, 'about [q-1] and [q-99]') ?? '';
    expect(out).toContain('[q-1] (question, r, answered) asked: "why?"');
    expect(out).toContain('Answer: because');
    expect(out).not.toContain('q-99');
    expect(citations(s, 'about q-1')).toBeNull();
  });
});
