import { describe, expect, it } from 'vitest';
import { Store } from './store.ts';
import type { Context } from './types.ts';

const ctx: Context = {
  session: 's1',
  harness: 'claude-msb',
  cwd: '/r',
  root: '/r',
  repo: 'r',
  transcript: '/t.jsonl',
};

function store() {
  let t = 1_000_000;
  const s = new Store(':memory:', () => ++t);
  s.take(
    [
      { kind: 'question', text: 'why?' },
      { kind: 'task', text: 'do it' },
    ],
    null,
    ctx,
  );
  return s;
}

describe('tags', () => {
  it('defines a tag the first time it is set, and lists items by it', () => {
    const s = store();
    s.tags.set(1, 'later', true);
    s.tags.set(2, 'Later', true);
    s.tags.set(2, 'big', true);
    expect(s.get('t-2')?.tags).toEqual(['big', 'later']);
    expect(
      s
        .list('inbox', { tag: 'later' })
        .map((i) => i.ref)
        .sort(),
    ).toEqual(['q-1', 't-2']);
    expect(s.tags.all().map((t) => [t.name, t.count])).toEqual([
      ['big', 1],
      ['later', 2],
    ]);
    s.tags.set(1, 'later', false);
    expect(s.get('q-1')?.tags).toEqual([]);
  });

  it('renames, recolors, and deletes a tag everywhere at once', () => {
    const s = store();
    s.tags.set(1, 'later', true);
    const v = s.version();
    s.tags.rename('later', 'someday');
    expect(s.version()).not.toBe(v);
    expect(s.get(1)?.tags).toEqual(['someday']);
    expect(s.tags.recolor('someday', '#ABCDEF').color).toBe('#abcdef');
    const gone = s.tags.remove('someday');
    expect(s.get(1)?.tags).toEqual([]);
    expect(s.tags.all()).toEqual([]);
    s.tags.restore(gone.deleted, gone.color, gone.items);
    expect(s.get(1)?.tags).toEqual(['someday']);
    expect(s.tags.get('someday')?.color).toBe('#abcdef');
  });

  it('refuses bad names, clashing renames, and bad colors', () => {
    const s = store();
    expect(() => s.tags.set(1, ' ', true)).toThrow(/1–32/);
    expect(() => s.tags.set(1, 'a,b', true)).toThrow(/commas/);
    s.tags.define('a');
    s.tags.define('b');
    expect(() => s.tags.rename('a', 'B')).toThrow(/exists/);
    expect(() => s.tags.recolor('a', 'red')).toThrow(/#rrggbb/);
  });

  it('counts only unarchived items, and prunes links to deleted items', () => {
    const s = store();
    s.tags.set(1, 'x', true);
    s.tags.set(2, 'x', true);
    s.setArchived(2);
    expect(s.tags.get('x')?.count).toBe(1);
    s.db.exec('DELETE FROM items WHERE id = 2');
    s.tags.prune();
    expect(
      Number((s.db.prepare('SELECT COUNT(*) AS n FROM item_tags').get() as { n: number }).n),
    ).toBe(1);
  });
});
