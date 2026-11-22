import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { citations } from './cite.ts';
import { handle, instructions, relayReply, respond } from './mcp.ts';

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
  it('answers a line it cannot parse with a JSON-RPC parse error', () => {
    expect(JSON.parse(respond(new Store(':memory:'), '{"jsonrpc":') ?? '')).toMatchObject({
      id: null,
      error: { code: -32700 },
    });
  });

  it('lists take, settle, owed, and show', () => {
    const out = handle(new Store(':memory:'), fb, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }) as {
      result: { tools: { name: string }[] };
    };
    expect(out.result.tools.map((t) => t.name)).toEqual(['take', 'settle', 'owed', 'show']);
  });

  it('shows items by id, and marks them shown to the session', () => {
    const s = new Store(':memory:');
    call(s, 'take', { items: [{ kind: 'question', text: 'why?' }] });
    call(s, 'settle', { id: 'q-1', outcome: 'answered', note: 'because' });
    expect(call(s, 'show', { ids: ['q-1'] }).result.content[0]?.text).toContain('Answer: because');
    expect(call(s, 'show', { ids: ['q-9'] }).result.content[0]?.text).toContain('No item');
    expect(citations(s, '[q-1]', 's')).toContain('shown earlier');
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

  it('files an item already settled, and leaves one with an unfit outcome owed', () => {
    const s = new Store(':memory:');
    const out = call(s, 'take', {
      items: [
        { kind: 'question', text: 'why?', outcome: 'answered', note: 'Because.' },
        { kind: 'task', text: 'do it', outcome: 'answered', note: 'Did.' },
        { kind: 'task', text: 'later' },
      ],
    }).result.content[0]?.text;
    expect(s.get('q-1')).toMatchObject({ outcome: 'answered', note: 'Because.' });
    expect(s.get('t-2')?.outcome).toBeNull();
    expect(s.get('t-3')?.outcome).toBeNull();
    expect(out).toMatch(/q-1: why\? \[settled as answered/);
    expect(out).toMatch(/t-2: do it \[not settled/);
    expect(out).toMatch(/settle` each task when it is done/);
    expect(out).toMatch(/end an answer in chat with "\[.*q-1.*\]", appended to its last paragraph/);
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

  it('keeps a verdict, basis, and scope, dropping values of the wrong shape', () => {
    const s = new Store(':memory:');
    call(s, 'take', {
      items: [
        {
          kind: 'question',
          text: 'is it live?',
          outcome: 'answered',
          note: 'Yes, rebuilt and restarted.',
          verdict: 'Yes.',
          basis: 'measured',
          scope: 'session',
        },
      ],
    });
    expect(s.get('q-1')).toMatchObject({ verdict: 'Yes.', basis: 'measured', scope: 'session' });
    call(s, 'settle', { id: 'q-1', outcome: 'answered', note: 'still yes', basis: 'guessed' });
    expect(s.get('q-1')).toMatchObject({ verdict: null, basis: null, scope: null });
  });

  it('shows the verdict and basis to an agent reading the item', () => {
    const s = new Store(':memory:');
    call(s, 'take', { items: [{ kind: 'question', text: 'why?' }] });
    call(s, 'settle', {
      id: 'q-1',
      outcome: 'answered',
      note: 'long',
      verdict: 'Because.',
      basis: 'read',
    });
    const out = call(s, 'show', { ids: ['q-1'] }).result.content[0]?.text ?? '';
    expect(out).toContain('Verdict: Because.');
    expect(out).toContain('read)');
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
    expect(out.error.message).toBe('kouhai: spawnSync node ETIMEDOUT');
  });
});

describe('instructions', () => {
  it("quote the user's misfiles and reasons so later sessions learn from them", () => {
    const s = new Store(':memory:');
    const plain = instructions(s);
    expect(plain).not.toContain('by mistake');
    s.take([{ kind: 'task', text: 'rename the var' }], null, fb);
    s.setMisfiled('t-1', true, 'did it the same turn');
    expect(instructions(s)).toContain('"rename the var" (did it the same turn)');
  });
});
