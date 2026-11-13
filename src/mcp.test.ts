import { describe, expect, it } from 'vitest';
import { handle } from './mcp.ts';
import { Store } from './store.ts';

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
  it('lists take, settle, and owed', () => {
    const out = handle(new Store(':memory:'), fb, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }) as {
      result: { tools: { name: string }[] };
    };
    expect(out.result.tools.map((t) => t.name)).toEqual(['take', 'settle', 'owed']);
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
});
