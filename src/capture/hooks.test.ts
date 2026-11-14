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

const transcript = (lines: object[]) => {
  const p = join(mkdtempSync(join(tmpdir(), 'dixeram-')), 't.jsonl');
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n'));
  return p;
};
const queued = (prompt: string, id: string) => ({
  type: 'attachment',
  attachment: {
    type: 'queued_command',
    prompt,
    source_uuid: id,
    commandMode: 'prompt',
    humanTurn: true,
  },
});

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

  it("offers last turn's answers as parents even once read", () => {
    let t = 1000;
    const s = new Store(':memory:', () => t);
    said(s, 'what is a turn?');
    s.take([{ kind: 'question', text: 'what is a turn?' }], null, ctx('s1'));
    t = 2000;
    s.settle('q-1', 'answered', 'one prompt');
    s.setRead('q-1');
    t = 3000;
    const next = said(s, 'and a session?');
    expect(next).toContain('q-1');
    expect(next).toContain('`parent`');
    expect(next).not.toContain('`clear`');
  });
});

describe('stopHook', () => {
  it('says nothing about owed items: they are already filed', () => {
    const s = new Store(':memory:');
    s.take([{ kind: 'task', text: 'bump deps' }], null, ctx('s1'));
    expect(stopHook(s, { session_id: 's1', transcript_path: '/nowhere.jsonl' })).toBeNull();
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

  it('lets a mid-turn message through when its own prompt hook ran', () => {
    const p = transcript([
      { type: 'user', origin: { kind: 'human' }, message: { content: 'go' } },
      queued('is there a test for this?', 'm2'),
    ]);
    const s = new Store(':memory:');
    s.addTurn(ctx('s1'), 'is there a test for this?');
    expect(stopHook(s, { session_id: 's1', transcript_path: p })).toBeNull();
  });
});

describe('promptHook when the tool it names is missing', () => {
  const delta = (added: string[], removed: string[] = [], failed: string[] = []) => ({
    type: 'attachment',
    attachment: {
      type: 'deferred_tools_delta',
      addedNames: added,
      removedNames: removed,
      failedMcpServers: failed,
    },
  });
  const run = (s: Store, p: string) =>
    promptHook(s, { ...payload('hi'), transcript_path: p }) as Out;

  it('warns once when the server offers only the old tools', () => {
    const p = transcript([
      delta(['mcp__plugin_dixeram_dixeram__ask', 'mcp__plugin_dixeram_dixeram__answer']),
    ]);
    const s = new Store(':memory:');
    const first = run(s, p);
    expect(first.systemMessage).toMatch(/dixeram ✗ .*out of date.*\/mcp/);
    expect(first.hookSpecificOutput?.additionalContext).toContain('Nothing can be filed');
    expect(run(s, p).systemMessage).toBeUndefined();
  });

  it('warns when the server failed to connect', () => {
    const p = transcript([delta([], [], ['plugin:dixeram:dixeram'])]);
    expect(run(new Store(':memory:'), p).systemMessage).toMatch(/failed to connect/);
  });

  it('stays quiet once a reconnect brings take', () => {
    const p = transcript([
      delta(['mcp__plugin_dixeram_dixeram__ask']),
      delta(['mcp__plugin_dixeram_dixeram__take'], ['mcp__plugin_dixeram_dixeram__ask']),
    ]);
    expect(run(new Store(':memory:'), p).systemMessage).toBeUndefined();
  });

  it('stays quiet when the transcript says nothing about tools', () => {
    const p = transcript([{ type: 'user', message: { content: 'x' } }]);
    expect(run(new Store(':memory:'), p).systemMessage).toBeUndefined();
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
