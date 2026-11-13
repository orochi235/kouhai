import { describe, expect, it } from 'vitest';
import { ARCHIVE_TTL_MS, TURN_TTL_MS } from './paths.ts';
import { Store } from './store.ts';
import type { Context } from './types.ts';

const ctx: Context = {
  session: 's1',
  harness: 'claude-msb',
  cwd: '/r/sub',
  root: '/r',
  repo: 'r',
  transcript: '/t.jsonl',
};

function store(start = 1_000_000) {
  let t = start;
  const s = new Store(':memory:', () => t);
  return { s, tick: (ms = 1) => (t += ms) };
}

describe('Store', () => {
  it('files questions under the turn that carried them', () => {
    const { s } = store();
    const turn = s.addTurn(ctx, 'fix the build. also why is CI slow?');
    const [q] = s.ask(['why is CI slow?'], turn.id, { ...ctx, session: 'other' });
    expect(q?.ref).toBe('q-1');
    expect(q?.session).toBe('s1');
    expect(q?.prompt).toBe('fix the build. also why is CI slow?');
  });

  it('falls back to the caller context for an unknown turn', () => {
    const { s } = store();
    const [q] = s.ask(['what?'], 't-nope', { ...ctx, session: 'fb' });
    expect(q?.session).toBe('fb');
    expect(q?.prompt).toBeNull();
  });

  it('moves a question through unread, read, and archived', () => {
    const { s, tick } = store();
    const [q] = s.ask(['how?'], null, ctx);
    expect(s.counts()).toMatchObject({ unread: 0, waiting: 1 });
    tick();
    s.answer('q-1', 'like this', [{ kind: 'url', ref: 'https://x' }]);
    expect(s.counts()).toMatchObject({ unread: 1, waiting: 0 });
    s.setRead(q!.id);
    expect(s.list('unread')).toHaveLength(0);
    s.setArchived('1');
    expect(s.list('inbox')).toHaveLength(0);
    expect(s.list('archived')).toHaveLength(1);
  });

  it('re-answering replaces text, keeps attachments, and brings it back unread', () => {
    const { s } = store();
    s.ask(['how?'], null, ctx);
    s.answer('q-1', 'v1', [{ kind: 'file', ref: '/a' }]);
    s.setRead('q-1');
    s.setArchived('q-1');
    const q = s.answer('q-1', 'v2', [
      { kind: 'file', ref: '/a' },
      { kind: 'artifact', ref: 'https://c' },
    ]);
    expect(q?.answer).toBe('v2');
    expect(q?.attachments.map((a) => a.ref)).toEqual(['/a', 'https://c']);
    expect(q?.readAt).toBeNull();
    expect(q?.archivedAt).toBeNull();
  });

  it('chases an unanswered question once', () => {
    const { s } = store();
    s.ask(['a?', 'b?'], null, ctx);
    s.answer('q-2', 'b');
    const open = s.unchased('s1', 0);
    expect(open.map((q) => q.ref)).toEqual(['q-1']);
    s.markChased(open.map((q) => q.id));
    expect(s.unchased('s1', 0)).toHaveLength(0);
  });

  it('prunes old archived answers and orphan turns, keeping pinned ones', () => {
    const { s, tick } = store();
    s.addTurn(ctx, 'orphan');
    s.ask(['old?', 'pinned?'], null, ctx);
    s.setArchived('q-1');
    s.setArchived('q-2');
    s.setPinned('q-2');
    tick(Math.max(ARCHIVE_TTL_MS, TURN_TTL_MS) + 1);
    expect(s.prune()).toEqual({ questions: 1, turns: 1 });
    expect(s.get('q-2')).not.toBeNull();
  });

  it('changes its version on any visible change', () => {
    const { s, tick } = store();
    const v0 = s.version();
    s.ask(['x?'], null, ctx);
    const v1 = s.version();
    tick();
    s.setRead('q-1');
    expect(new Set([v0, v1, s.version()]).size).toBe(3);
  });
});
