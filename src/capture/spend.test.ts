import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Costs } from '../engine/costs.ts';
import { meter } from '../engine/meter.ts';
import { Store } from '../engine/store.ts';
import { spendHook, subagentSpendHook } from './spend.ts';

const ctx = {
  session: 's1',
  harness: 'claude',
  cwd: null,
  root: null,
  repo: 'r',
  transcript: null,
};
const prompt = (text: string) => ({
  type: 'user',
  origin: { kind: 'human' },
  message: { content: text },
});
const call = (id: string, input: number) => ({
  type: 'assistant',
  message: { id, usage: { input_tokens: input } },
});
const jsonl = (lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const file = (lines: object[]) => {
  const p = join(mkdtempSync(join(tmpdir(), 'kouhai-')), 't.jsonl');
  writeFileSync(p, jsonl(lines));
  return p;
};

describe('spendHook', () => {
  it('counts a session first met mid-way from its last prompt, then only what was added', () => {
    const s = new Store(':memory:');
    const path = file([prompt('old'), call('a', 1000), prompt('new')]);
    const first = s.addTurn(ctx, 'new');
    appendFileSync(path, jsonl([call('b', 5)]));
    spendHook(s, { session_id: 's1', transcript_path: path });
    expect(s.costs.turn(first.id)).toMatchObject({ calls: 1, input: 5, repo: 'r' });

    appendFileSync(path, jsonl([call('c', 7)]));
    spendHook(s, { session_id: 's1', transcript_path: path });
    expect(s.costs.turn(first.id)).toMatchObject({ calls: 2, input: 12 });

    const second = s.addTurn(ctx, 'again');
    appendFileSync(path, jsonl([prompt('again'), call('d', 3)]));
    spendHook(s, { session_id: 's1', transcript_path: path });
    expect(s.costs.turn(second.id)).toMatchObject({ calls: 1, input: 3 });
  });

  it("adds a subagent's whole run to the turn that started it", () => {
    const s = new Store(':memory:');
    const turn = s.addTurn(ctx, 'go');
    const agent = file([prompt('task'), call('x', 4), call('y', 6)]);
    subagentSpendHook(s, { session_id: 's1', agent_id: 'ag', agent_transcript_path: agent });
    expect(s.costs.turn(turn.id)).toMatchObject({ calls: 2, input: 10, agents: 1 });
  });

  it('drops costs and meters with archived items', () => {
    let now = 0;
    const s = new Store(':memory:', () => now);
    const turn = s.addTurn(ctx, 'go');
    spendHook(s, { session_id: 's1', transcript_path: file([prompt('go'), call('a', 1)]) });
    now = 181 * 86_400_000;
    s.prune();
    expect(s.costs.turn(turn.id)).toBeNull();
    expect(s.costs.meterOf('session:s1')).toBeNull();
  });

  it('adds count columns a table made by an older version lacks', () => {
    const s = new Store(':memory:');
    s.db.exec('DROP TABLE turn_costs');
    s.db.exec(
      `CREATE TABLE turn_costs (turn TEXT PRIMARY KEY, session TEXT NOT NULL, harness TEXT, repo TEXT, model TEXT,
        at INTEGER NOT NULL, calls INTEGER NOT NULL, input INTEGER NOT NULL, cache_read INTEGER NOT NULL,
        cache_write INTEGER NOT NULL, output INTEGER NOT NULL, kouhai_added INTEGER NOT NULL,
        kouhai_read INTEGER NOT NULL, trips INTEGER NOT NULL, trip_read INTEGER NOT NULL,
        agents INTEGER NOT NULL DEFAULT 0)`,
    );
    const again = new Costs(s.db, s.now);
    const turn = s.addTurn(ctx, 'go');
    again.record(
      'k',
      's1',
      { ...meter([], 0).spend, calls: 1, cacheWrite1h: 5 },
      { offset: 0, live: 0 },
    );
    expect(again.turn(turn.id)).toMatchObject({ cache_write_1h: 5, kouhai_output: 0 });
  });
});
