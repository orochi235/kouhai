import { describe, expect, it } from 'vitest';
import { promptHook, stopHook } from './hooks.ts';
import { Store } from './store.ts';

const payload = (prompt: string) => ({
  session_id: 's1',
  transcript_path: '/Users/x/.claude-pw/projects/p/s1.jsonl',
  cwd: '/nowhere/dir',
  prompt,
});

describe('promptHook', () => {
  it('stays quiet on an order', () => {
    expect(promptHook(new Store(':memory:'), payload('commit it'))).toBeNull();
  });

  it('opens a turn and names it in the context', () => {
    const s = new Store(':memory:');
    const out = promptHook(s, payload('why is it slow?')) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const id = /turn "(t-[0-9a-f]{8})"/.exec(out.hookSpecificOutput.additionalContext)?.[1];
    expect(id).toBeTruthy();
    const turn = s.turn(id!);
    expect(turn).toMatchObject({ session: 's1', harness: 'claude-pw', repo: 'dir' });
  });
});

describe('stopHook', () => {
  it('blocks once for an unanswered question, then lets go', () => {
    const s = new Store(':memory:');
    s.ask(['why?'], null, {
      session: 's1',
      harness: null,
      cwd: null,
      root: null,
      repo: null,
      transcript: null,
    });
    const first = stopHook(s, { session_id: 's1' }) as { decision: string; reason: string };
    expect(first.decision).toBe('block');
    expect(first.reason).toContain('q-1');
    expect(stopHook(s, { session_id: 's1' })).toBeNull();
  });

  it('ignores other sessions', () => {
    const s = new Store(':memory:');
    s.ask(['why?'], null, {
      session: 's2',
      harness: null,
      cwd: null,
      root: null,
      repo: null,
      transcript: null,
    });
    expect(stopHook(s, { session_id: 's1' })).toBeNull();
  });
});

describe('sessionStartHook', () => {
  it('names unread answers from this repo on startup only', async () => {
    const { sessionStartHook } = await import('./hooks.ts');
    const s = new Store(':memory:');
    const ctx = {
      session: 'old',
      harness: null,
      cwd: '/x/dixeram',
      root: '/x/dixeram',
      repo: 'dixeram',
      transcript: null,
    };
    s.ask(['why?'], null, ctx);
    s.answer('q-1', 'because');
    const p = { source: 'startup', cwd: '/x/dixeram' };
    const out = sessionStartHook(s, p) as { hookSpecificOutput: { additionalContext: string } };
    expect(out.hookSpecificOutput.additionalContext).toContain('q-1');
    expect(sessionStartHook(s, { ...p, source: 'clear' })).toBeNull();
    s.setRead('q-1');
    expect(sessionStartHook(s, p)).toBeNull();
  });
});
