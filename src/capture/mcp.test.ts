import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { handle, relayReply } from './mcp.ts';

const fb = { session: 's', harness: 'claude', cwd: '/c', root: '/c', repo: 'c', transcript: null };

const call = (s: Store, name: string, args: object) =>
  handle(s, fb, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }) as {
    result: { content: { text: string }[]; isError?: boolean };
  };

describe('mcp', () => {
  it('lists take, settle, clear, and owed', () => {
    const out = handle(new Store(':memory:'), fb, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }) as {
      result: { tools: { name: string }[] };
    };
    expect(out.result.tools.map((t) => t.name)).toEqual(['take', 'settle', 'clear', 'owed']);
  });

  it('takes, lists owed, and settles with attachments, dropping malformed ones', () => {
    const s = new Store(':memory:');
    const took = call(s, 'take', {
      items: [
        { kind: 'question', text: 'why?' },
        { kind: 'task', text: 'bump' },
        { kind: 'x', text: 'y' },
      ],
    });
    expect(took.result.content[0]?.text).toContain('q-1: why?');
    expect(took.result.content[0]?.text).toContain('t-2: bump');
    expect(call(s, 'owed', {}).result.content[0]?.text).toContain('t-2 (task)');
    const r = call(s, 'settle', {
      id: 'q-1',
      outcome: 'answered',
      note: 'because',
      attachments: [
        { kind: 'artifact', ref: 'https://claude.ai/a' },
        { kind: 'bogus', ref: 'x' },
      ],
    });
    expect(r.result.isError).toBeUndefined();
    expect(s.get('q-1')?.attachments).toEqual([{ kind: 'artifact', ref: 'https://claude.ai/a' }]);
  });

  it('reports a bad id or a mismatched outcome as a tool error', () => {
    const s = new Store(':memory:');
    expect(call(s, 'settle', { id: 'q-9', outcome: 'answered', note: 'x' }).result.isError).toBe(
      true,
    );
    call(s, 'take', { items: [{ kind: 'task', text: 'do' }] });
    expect(call(s, 'settle', { id: 't-1', outcome: 'answered', note: 'x' }).result.isError).toBe(
      true,
    );
  });

  it('answers notifications with nothing', () => {
    expect(
      handle(new Store(':memory:'), fb, { jsonrpc: '2.0', method: 'notifications/initialized' }),
    ).toBeNull();
  });

  it('clears a settled question from the inbox, and refuses an owed one', () => {
    const s = new Store(':memory:');
    s.take([{ kind: 'question', text: 'what do the badges mean?' }], null, fb);
    expect(call(s, 'clear', { id: 'q-1' }).result.isError).toBe(true);
    s.settle('q-1', 'answered', 'unread items');
    expect(call(s, 'clear', { id: 'q-1' }).result.isError).toBeUndefined();
    expect(s.counts()).toMatchObject({ unread: 0, inbox: 0 });
  });

  it('threads a follow-up under a settled item, and refuses an owed parent', () => {
    const s = new Store(':memory:');
    s.take([{ kind: 'question', text: 'what is a turn?' }], null, fb);
    const early = call(s, 'take', {
      items: [{ kind: 'question', text: 'and a session?', parent: 'q-1' }],
    });
    expect(early.result.isError).toBe(true);
    s.settle('q-1', 'answered', 'one prompt and what follows');
    const r = call(s, 'take', {
      items: [{ kind: 'question', text: 'and a session?', parent: '1' }],
    });
    expect(r.result.content[0]?.text).toContain('q-2 (follows q-1)');
    expect(s.get('q-2')?.parent).toBe('q-1');
  });
});

describe('relay', () => {
  const callMsg = { jsonrpc: '2.0' as const, id: 7, method: 'tools/call' };

  it("passes the child's reply through", () => {
    expect(relayReply(callMsg, { stdout: '{"ok":1}\n', status: 0 })).toBe('{"ok":1}');
  });

  it('answers a tool call the child left unanswered with a tool error naming why', () => {
    const out = JSON.parse(
      relayReply(callMsg, { stdout: '', stderr: 'boom\nSyntaxError: bad', status: 1 }),
    );
    expect(out.id).toBe(7);
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('exited 1: boom SyntaxError: bad');
  });

  it('answers any other request with a JSON-RPC error, including a timeout', () => {
    const out = JSON.parse(
      relayReply(
        { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        { stdout: null, status: null, error: new Error('spawnSync node ETIMEDOUT') },
      ),
    );
    expect(out.error.message).toBe('dixeram: spawnSync node ETIMEDOUT');
  });
});
