import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { triage, triagesIn } from './triage.ts';

const ctx = (harness: string) => ({
  session: 's1',
  harness,
  cwd: null,
  root: null,
  repo: null,
  transcript: null,
});

describe('triagesIn', () => {
  it('reads the well-formed decisions for asked-about items out of a chatty reply', () => {
    const reply =
      'Sure:\n```json\n[{"id":1,"question":"q?","verdict":"v.","keep":true},{"id":9,"keep":true},{"id":2}]\n```';
    expect(triagesIn(reply, new Set([1, 2]))).toEqual([
      { id: 1, question: 'q?', verdict: 'v.', keep: true },
    ]);
    expect(triagesIn('no json', new Set([1]))).toEqual([]);
  });
});

describe('triage', () => {
  it('asks once per harness and marks every item seen, answered or not', async () => {
    const s = new Store(':memory:');
    for (const h of ['claude-msb', 'claude-msb', 'claude-pw']) {
      const [i] = s.take([{ kind: 'question', text: `${h}?` }], null, ctx(h));
      if (i) s.settle(i.id, 'answered', 'A.');
    }
    const asked: (string | null)[] = [];
    await triage(s, async (harness, _system, prompt) => {
      asked.push(harness);
      const ids = (JSON.parse(prompt) as { id: number }[]).map((i) => i.id);
      return { text: JSON.stringify([{ id: ids[0], verdict: 'V.', keep: false }]), usage: {} };
    });
    expect(asked.sort()).toEqual(['claude-msb', 'claude-pw']);
    expect(s.get(1)).toMatchObject({ verdict: 'V.', scope: 'session' });
    expect(s.get(2)?.verdict).toBeNull();
    let again = 0;
    await triage(s, async () => {
      again++;
      return { text: '[]', usage: {} };
    });
    expect(again).toBe(0);
  });
});
