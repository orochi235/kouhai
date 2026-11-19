import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { configDirs, fileBtws, untoldBtws } from './btw.ts';
import { promptHook, sessionStartHook, stopHook } from './hooks.ts';

const dirs: string[] = [];
function harness() {
  const home = mkdtempSync(join(tmpdir(), 'dixeram-btw-'));
  dirs.push(home);
  const dir = join(home, '.claude-test');
  mkdirSync(dir);
  const history = join(dir, 'history.jsonl');
  writeFileSync(
    history,
    `${JSON.stringify({ display: '/btw an old one?', sessionId: 's0', project: '/r' })}\n`,
  );
  const say = (display: string, sessionId = 's1', end = '\n') =>
    appendFileSync(
      history,
      `${JSON.stringify({ display, sessionId, project: '/r', timestamp: 1 })}${end}`,
    );
  return { home, dir, history, say };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('fileBtws', () => {
  it('starts at the end of the history, then files each new /btw once', () => {
    const { dir, say } = harness();
    const s = new Store(':memory:');
    expect(fileBtws(s, dir)).toEqual([]);
    say('/btw what is PBT?');
    say('fix the build');
    const [q] = fileBtws(s, dir);
    expect(q).toMatchObject({
      text: 'what is PBT?',
      via: 'btw',
      session: 's1',
      cwd: '/r',
      kind: 'question',
    });
    expect(fileBtws(s, dir)).toEqual([]);
    expect(s.list('all')).toHaveLength(1);
  });

  it('leaves a line still being written for the next look', () => {
    const { history, dir, say } = harness();
    const s = new Store(':memory:');
    fileBtws(s, dir);
    say('/btw half?', 's1', '');
    expect(fileBtws(s, dir)).toEqual([]);
    appendFileSync(history, '\n');
    expect(fileBtws(s, dir).map((i) => i.text)).toEqual(['half?']);
  });

  it('finds every config directory with a history', () => {
    const { home } = harness();
    mkdirSync(join(home, '.claude-empty'));
    expect(configDirs(home)).toEqual([join(home, '.claude-test')]);
  });
});

describe('hooks and /btw', () => {
  const payload = { session_id: 's1', transcript_path: '/t.jsonl', cwd: '/nowhere' };

  it('puts a /btw to its session once, on the next prompt', () => {
    const { dir, say } = harness();
    const s = new Store(':memory:');
    fileBtws(s, dir);
    say('/btw what is a metamer?');
    const ctx = (prompt: string) =>
      (
        promptHook(s, { ...payload, prompt }, dir) as {
          hookSpecificOutput: { additionalContext: string };
        }
      ).hookSpecificOutput.additionalContext;
    expect(ctx('carry on')).toContain('/btw, which you never saw: q-1 "what is a metamer?"');
    expect(ctx('and then')).not.toContain('/btw');
  });

  it('holds the turn open once for a /btw asked during it', () => {
    const { dir, say } = harness();
    const s = new Store(':memory:');
    fileBtws(s, dir);
    say('/btw what is git bundle?');
    expect(stopHook(s, payload, dir)).toMatchObject({ decision: 'block' });
    expect(stopHook(s, payload, dir)).toBeNull();
  });

  it("hands a quiet session's /btw to the next session in its repo", () => {
    let t = 0;
    const s = new Store(':memory:', () => t);
    s.take([{ kind: 'question', text: 'what is onto do?', via: 'btw' }], null, {
      session: 's0',
      harness: null,
      cwd: '/r',
      root: '/r',
      repo: 'r',
      transcript: null,
    });
    const start = () => sessionStartHook(s, { source: 'startup', cwd: '/r' }, '/nowhere');
    expect(JSON.stringify(start())).not.toContain('in an earlier session');
    t = 31 * 60 * 1000;
    expect(JSON.stringify(start())).toContain('in an earlier session: q-1');
    expect(untoldBtws(s, 's0')).toEqual([]);
  });
});
