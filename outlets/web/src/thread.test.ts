import { describe, expect, it } from 'vitest';
import type { Item } from './api.ts';
import { thread } from './thread.ts';

const item = (ref: string, raisedAt: number, parent: string | null = null) =>
  ({ ref, raisedAt, parent }) as Item;

describe('thread', () => {
  it('nests follow-ups under their first question, where the newest one sat', () => {
    const rows = thread([
      item('q-5', 50, 'q-3'),
      item('q-4', 40),
      item('q-3', 30, 'q-1'),
      item('q-2', 20),
      item('q-1', 10),
    ]);
    expect(rows.map((r) => `${r.reply ? '  ' : ''}${r.item.ref}`)).toEqual([
      'q-1',
      '  q-3',
      '  q-5',
      'q-4',
      'q-2',
    ]);
  });

  it('leaves a follow-up alone when its parent is not listed', () => {
    expect(thread([item('q-9', 90, 'q-1')])).toEqual([
      { item: item('q-9', 90, 'q-1'), reply: false },
    ]);
  });
});
