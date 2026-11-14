import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { promptHook, sessionStartHook, stopHook } from './hooks.ts';

const payload = (prompt: string) => ({
  session_id: 's1',
  transcript_path: '/Users/x/.claude-pw/projects/p/s1.jsonl',
  cwd: '/nowhere/dir',
  prompt,
});
const ctx = (session: string) => ({
  session,
  harness: null,
  cwd: null,
  root: null,
  repo: null,
  transcript: null,
});
type Out = {
  systemMessage?: string;
  decision?: string;
  reason?: string;
  hookSpecificOutput?: { additionalContext: string };
};

describe('promptHook', () => {
  it('opens a turn on every prompt and names it', () => {
    const s = new Store(':memory:');
    const out = promptHook(s, payload('commit it')) as Out;
    const id = /turn "(turn-[0-9a-f]{8})"/.exec(
      out.hookSpecificOutput?.additionalContext ?? '',
    )?.[1];
    expect(s.turn(id ?? '')).toMatchObject({ session: 's1', harness: 'claude-pw', repo: 'dir' });
    expect(out.systemMessage).toBeUndefined();
  });

  it('tells the user when a prompt looks like a question', () => {
    expect(
      (promptHook(new Store(':memory:'), payload('why is it slow?')) as Out).systemMessage,
    ).toMatch(/dixeram ▸/);
  });
});

describe('promptHook on the turn after an answer', () => {
  const said = (s: Store, prompt: string) =>
    (promptHook(s, payload(prompt)) as Out).hookSpecificOutput?.additionalContext ?? '';

  it('offers to clear questions answered last turn, and only those', () => {
    let t = 1000;
    const s = new Store(':memory:', () => t);
    s.take([{ kind: 'question', text: 'old?' }], null, ctx('s1'));
    s.settle('q-1', 'answered', 'yes');
    t = 2000;
    said(s, 'what do the badges mean?');
    s.take([{ kind: 'question', text: 'what do the badges mean?' }], null, ctx('s1'));
    t = 3000;
    s.settle('q-2', 'answered', 'unread items');
    t = 4000;
    const next = said(s, 'ok, rename them');
    expect(next).toContain('q-2');
    expect(next).not.toMatch(/q-1\b/);
    expect(next).toContain('`clear`');
    expect(said(s, 'next thing')).not.toContain('`clear`');
  });
});

describe('stopHook', () => {
  it('blocks once for owed items, worded per kind', () => {
    const s = new Store(':memory:');
    s.take(
      [
        { kind: 'question', text: 'why?' },
        { kind: 'task', text: 'bump deps' },
      ],
      null,
      ctx('s1'),
    );
    const first = stopHook(s, { session_id: 's1' }) as Out;
    expect(first.decision).toBe('block');
    expect(first.reason).toContain('q-1');
    expect(first.reason).toContain('t-2');
    expect(first.systemMessage).toContain('q-1, t-2');
    expect(stopHook(s, { session_id: 's1' })).toBeNull();
  });

  it('ignores other sessions', () => {
    const s = new Store(':memory:');
    s.take([{ kind: 'question', text: 'why?' }], null, ctx('s2'));
    expect(stopHook(s, { session_id: 's1' })).toBeNull();
  });

  it('blocks once for a mid-turn message the ledger never saw', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'dixeram-')), 't.jsonl');
    writeFileSync(
      p,
      [
        { type: 'user', origin: { kind: 'human' }, message: { content: 'go' } },
        {
          type: 'attachment',
          attachment: {
            type: 'queued_command',
            prompt: 'also rename foo',
            source_uuid: 'm1',
            commandMode: 'prompt',
            humanTurn: true,
          },
        },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n'),
    );
    const s = new Store(':memory:');
    const out = stopHook(s, { session_id: 's1', transcript_path: p }) as Out;
    expect(out.reason).toContain('also rename foo');
    expect(stopHook(s, { session_id: 's1', transcript_path: p })).toBeNull();
  });
});

describe('sessionStartHook', () => {
  it('names owed and unread items from this repo on startup only', () => {
    const s = new Store(':memory:');
    const c = { ...ctx('old'), cwd: '/x/dixeram', root: '/x/dixeram', repo: 'dixeram' };
    s.take(
      [
        { kind: 'question', text: 'why?' },
        { kind: 'task', text: 'bump' },
      ],
      null,
      c,
    );
    s.settle('q-1', 'answered', 'because');
    const p = { source: 'startup', cwd: '/x/dixeram' };
    const out = sessionStartHook(s, p) as Out;
    expect(out.hookSpecificOutput?.additionalContext).toContain('still owed: t-2');
    expect(out.hookSpecificOutput?.additionalContext).toContain('unread: q-1');
    expect(sessionStartHook(s, { ...p, source: 'clear' })).toBeNull();
  });
});
