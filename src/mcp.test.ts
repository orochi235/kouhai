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
  it('lists ask and answer', () => {
    const out = handle(new Store(':memory:'), fb, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }) as {
      result: { tools: { name: string }[] };
    };
    expect(out.result.tools.map((t) => t.name)).toEqual(['ask', 'answer']);
  });

  it('asks and answers with attachments, dropping malformed ones', () => {
    const s = new Store(':memory:');
    expect(call(s, 'ask', { questions: ['why?'] }).result.content[0]?.text).toContain('q-1: why?');
    const r = call(s, 'answer', {
      id: 'q-1',
      answer: 'because',
      attachments: [
        { kind: 'artifact', ref: 'https://claude.ai/a' },
        { kind: 'bogus', ref: 'x' },
      ],
    });
    expect(r.result.isError).toBeUndefined();
    expect(s.get('q-1')?.attachments).toEqual([{ kind: 'artifact', ref: 'https://claude.ai/a' }]);
  });

  it('reports a bad id as a tool error', () => {
    expect(call(new Store(':memory:'), 'answer', { id: 'q-9', answer: 'x' }).result.isError).toBe(
      true,
    );
  });

  it('answers notifications with nothing', () => {
    expect(
      handle(new Store(':memory:'), fb, { jsonrpc: '2.0', method: 'notifications/initialized' }),
    ).toBeNull();
  });
});
