import { describe, expect, it } from 'vitest';
import { RefScheme, requireRefFormat } from './refs.ts';
import { Store } from './store.ts';
import type { Context } from './types.ts';

const ctx: Context = {
  session: 's',
  harness: null,
  cwd: '/r',
  root: '/r',
  repo: 'r',
  transcript: null,
};

describe('RefScheme', () => {
  const kou = new RefScheme({ question: 'KOU-Q{n}', task: 'KOU-{n}' });

  it('writes each kind by its template', () => {
    expect(kou.refOf('question', 7)).toBe('KOU-Q7');
    expect(kou.refOf('task', 7)).toBe('KOU-7');
  });

  it('reads its own refs, the default ones, and bare numbers, ignoring case', () => {
    expect(['KOU-Q7', 'kou-7', 'q-7', 'T-7', '7', 7].map((r) => kou.idOf(r))).toEqual([
      7, 7, 7, 7, 7, 7,
    ]);
    expect(kou.idOf('KOU-X7')).toBeNull();
    expect(kou.idOf('faq-7')).toBeNull();
  });

  it('tells the kind from a ref when only one template fits it', () => {
    expect(['KOU-Q7', 'KOU-7', 'q-7', 't-7', '7'].map((r) => kou.kindOf(r))).toEqual([
      'question',
      'task',
      'question',
      'task',
      null,
    ]);
    expect(new RefScheme({ question: 'K-{n}', task: 'K-{n}' }).kindOf('K-7')).toBeNull();
  });

  it('finds refs standing alone in prose, the longer template first', () => {
    const found = [...'see KOU-Q3, kou-4 and q-5 but not xKOU-6 or q-7b'.matchAll(kou.inProse())];
    expect(found.map((m) => m[1])).toEqual(['KOU-Q3', 'kou-4', 'q-5']);
  });

  it('turns away a template without exactly one {n} or with characters a ref cannot hold', () => {
    expect(() => requireRefFormat({ question: 'q', task: 't-{n}' })).toThrow(/refs.question/);
    expect(() => requireRefFormat({ question: 'q {n}', task: 't-{n}' })).toThrow();
    expect(() => requireRefFormat({ question: 'q-{n}-{n}', task: 't-{n}' })).toThrow();
    expect(requireRefFormat({ question: 'Q.{n}', task: 'T_{n}' })).toEqual({
      question: 'Q.{n}',
      task: 'T_{n}',
    });
  });
});

describe('the refs setting', () => {
  it('renames every item at once, and old refs still find them', () => {
    const s = new Store(':memory:');
    const [a] = s.take([{ kind: 'task', text: 'ship it' }], null, ctx);
    expect(a?.ref).toBe('t-1');
    s.setSetting('refs', { question: 'R-Q{n}', task: 'R-{n}' });
    expect(s.get('t-1')?.ref).toBe('R-1');
    expect(s.get('r-1')?.text).toBe('ship it');
    expect(() => s.setSetting('refs', { question: 'nope', task: 'R-{n}' })).toThrow();
  });

  it('keeps a slug from reading as a ref', () => {
    const s = new Store(':memory:');
    s.setSetting('refs', { question: 'kou-{n}', task: 'kou-t{n}' });
    const [a] = s.take([{ kind: 'question', text: 'x', slug: 'kou-12' }], null, ctx);
    expect(a?.slug).toBeNull();
  });
});
