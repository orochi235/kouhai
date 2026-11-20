import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
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

const q = (text: string) => ({ kind: 'question' as const, text });
const t = (text: string) => ({ kind: 'task' as const, text });

describe('Store', () => {
  it('files items under the turn that carried them, numbering both kinds together', () => {
    const { s } = store();
    const turn = s.addTurn(ctx, 'fix the build. also why is CI slow? then bump deps');
    const items = s.take([q('why is CI slow?'), t('bump deps')], turn.id, { ...ctx, session: 'x' });
    expect(items.map((i) => i.ref)).toEqual(['q-1', 't-2']);
    expect(items[0]?.session).toBe('s1');
    expect(items[1]?.prompt).toContain('bump deps');
  });

  it('falls back to the caller context for an unknown turn', () => {
    const { s } = store();
    const [i] = s.take([q('what?')], 'turn-nope', { ...ctx, session: 'fb' });
    expect(i?.session).toBe('fb');
    expect(i?.prompt).toBeNull();
  });

  it('moves an item from owed to unread to read to archived', () => {
    const { s, tick } = store();
    s.setSetting('archiveDone', false);
    s.take([t('rename it')], null, ctx);
    expect(s.counts()).toMatchObject({ unread: 0, owed: 1 });
    tick();
    s.settle('t-1', 'done', 'renamed in abc123', [{ kind: 'url', ref: 'https://x' }]);
    expect(s.counts()).toMatchObject({ unread: 1, owed: 0 });
    s.setRead('1');
    expect(s.list('unread')).toHaveLength(0);
    s.setArchived('t-1');
    expect(s.list('inbox')).toHaveLength(0);
    expect(s.list('archived')).toHaveLength(1);
  });

  it('archives a task settled as done, unless pinned or the setting is off', () => {
    const { s } = store();
    s.take([t('a'), t('b'), t('c'), q('d?')], null, ctx);
    s.setPinned('t-2');
    s.settle('t-1', 'done', 'did a');
    s.settle('t-2', 'done', 'did b');
    s.settle('t-3', 'dropped', 'not needed');
    s.settle('q-4', 'answered', 'yes');
    expect(s.list('archived').map((i) => i.ref)).toEqual(['t-1']);
    s.setSetting('archiveDone', false);
    s.settle('t-3', 'done', 'did c after all');
    expect(s.get('t-3')?.archivedAt).toBeNull();
    expect(s.settings()).toEqual({ archiveDone: false });
    expect(() => s.setSetting('archiveDone', 'yes')).toThrow(/boolean/);
    expect(() => s.setSetting('nope', true)).toThrow(/no setting/);
  });

  it('splits the inbox by kind, in listing and in counts', () => {
    const { s } = store();
    s.take([q('why?'), t('do it'), t('and this')], null, ctx);
    s.setArchived('t-3');
    expect(s.list('inbox', { kind: 'task' }).map((i) => i.ref)).toEqual(['t-2']);
    expect(s.list('inbox', { kind: 'question' }).map((i) => i.ref)).toEqual(['q-1']);
    expect(s.counts()).toMatchObject({ inbox: 2, questions: 1, tasks: 1 });
  });

  it('refuses an outcome that does not fit the kind', () => {
    const { s } = store();
    s.take([q('why?'), t('do it')], null, ctx);
    expect(() => s.settle('q-1', 'done', 'x')).toThrow(/answered/);
    expect(() => s.settle('t-2', 'answered', 'x')).toThrow(/done/);
    expect(s.settle('t-2', 'dropped', 'superseded by t-3')?.outcome).toBe('dropped');
  });

  it('settling again replaces the note, keeps attachments, and brings it back unread', () => {
    const { s } = store();
    s.take([q('how?')], null, ctx);
    s.settle('q-1', 'answered', 'v1', [{ kind: 'file', ref: '/a' }]);
    s.setRead('q-1');
    s.setArchived('q-1');
    const i = s.settle('q-1', 'answered', 'v2', [{ kind: 'artifact', ref: 'https://c' }]);
    expect(i?.note).toBe('v2');
    expect(i?.attachments.map((a) => a.ref)).toEqual(['/a', 'https://c']);
    expect(i?.readAt).toBeNull();
    expect(i?.archivedAt).toBeNull();
  });

  it('chases a key once, and knows which prompts it heard', () => {
    const { s } = store();
    s.addTurn(ctx, 'rename foo');
    expect(s.heard('s1', 'rename foo')).toBe(true);
    expect(s.heard('s1', 'rename bar')).toBe(false);
    expect(s.heard('s2', 'rename foo')).toBe(false);
    expect(s.chased('m1')).toBe(false);
    expect(s.chaseOnce('m1')).toBe(true);
    expect(s.chased('m1')).toBe(true);
    expect(s.chaseOnce('m1')).toBe(false);
  });

  it('keeps its own copy of a transom attachment, and deletes it with the item', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dixeram-'));
    vi.stubEnv('DIXERAM_HOME', join(dir, 'home'));
    try {
      const shot = join(dir, 'shot.png');
      writeFileSync(shot, 'png');
      const { s, tick } = store();
      s.take([q('does it render?')], null, ctx);
      const item = s.settle('q-1', 'answered', 'yes', [{ kind: 'transom', ref: shot }]);
      const [a] = item?.attachments ?? [];
      expect(a).toEqual({
        kind: 'file',
        ref: join(dir, 'home', 'enclosures', '1', 'shot.png'),
        label: 'shot.png',
      });
      rmSync(shot);
      expect(existsSync(a?.ref ?? '')).toBe(true);
      s.setArchived('q-1');
      tick(ARCHIVE_TTL_MS + 1);
      s.prune();
      expect(existsSync(a?.ref ?? '')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('points a note at its own copies of transom images', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dixeram-'));
    vi.stubEnv('DIXERAM_HOME', join(dir, 'home'));
    vi.stubEnv('HOME', dir);
    try {
      const shot = join(dir, 'transom', 'inbox', 'r', 'a.png');
      mkdirSync(dirname(shot), { recursive: true });
      writeFileSync(shot, 'png');
      const { s } = store();
      s.take([q('does it render?')], null, ctx);
      const note = `![one](${shot}) and [two](http://localhost:8787/to/r/a.png), [gone](http://localhost:8787/to/r/b.png). On the wall at http://localhost:8787/to/r/a.png. \`${shot}\``;
      const kept = join(dir, 'home', 'enclosures', '1', 'a.png');
      expect(s.settle('q-1', 'answered', note)?.note).toBe(
        `![one](${kept}) and [two](${kept}), [gone](http://localhost:8787/to/r/b.png). On the wall at [a.png](${kept}). \`${shot}\``,
      );
    } finally {
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prunes old archived items, orphan turns, and old chase keys, keeping pinned ones', () => {
    const { s, tick } = store();
    s.addTurn(ctx, 'orphan');
    s.chaseOnce('m1');
    s.take([q('old?'), q('pinned?')], null, ctx);
    s.setArchived('q-1');
    s.setArchived('q-2');
    s.setPinned('q-2');
    tick(Math.max(ARCHIVE_TTL_MS, TURN_TTL_MS) + 1);
    expect(s.prune()).toEqual({ items: 1, turns: 1 });
    expect(s.get('q-2')).not.toBeNull();
    expect(s.chaseOnce('m1')).toBe(true);
  });

  it('migrates a v1 questions table into items, keeping ids', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dixeram-')), 'inbox.db');
    const v1 = new DatabaseSync(path);
    v1.exec(`CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, turn TEXT, session TEXT, harness TEXT,
      cwd TEXT, root TEXT, repo TEXT, transcript TEXT, prompt TEXT, question TEXT NOT NULL, answer TEXT,
      attachments TEXT NOT NULL DEFAULT '[]', asked_at INTEGER NOT NULL, answered_at INTEGER, read_at INTEGER,
      archived_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0, nagged INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
      CREATE INDEX questions_session ON questions (session, answered_at);
      INSERT INTO questions (id, question, answer, asked_at, answered_at, updated_at) VALUES (4, 'why?', 'because', 1, 2, 2);
      INSERT INTO questions (id, question, asked_at, updated_at) VALUES (5, 'how?', 3, 3);`);
    v1.close();
    const s = new Store(path);
    expect(s.get(4)).toMatchObject({
      ref: 'q-4',
      kind: 'question',
      text: 'why?',
      outcome: 'answered',
      note: 'because',
    });
    expect(s.get(5)).toMatchObject({ outcome: null });
    expect(s.take([t('next')], null, ctx)[0]?.ref).toBe('t-6');
    s.close();
    expect(new Store(path).get(4)?.note).toBe('because');
  });

  it('changes its version on any visible change', () => {
    const { s, tick } = store();
    const v0 = s.version();
    s.take([q('x?')], null, ctx);
    const v1 = s.version();
    tick();
    s.setRead('q-1');
    expect(new Set([v0, v1, s.version()]).size).toBe(3);
  });

  it('marks all read and names what it marked', () => {
    const { s } = store();
    s.take([q('a?'), t('b')], null, ctx);
    s.settle('q-1', 'answered', 'yes');
    s.settle('t-2', 'dropped', 'not needed');
    expect(s.readAll().sort()).toEqual(['q-1', 't-2']);
    expect(s.readAll()).toEqual([]);
  });

  it('changes its version on two writes at the same clock time', () => {
    const { s } = store();
    s.take([q('x?')], null, ctx);
    const v = s.version();
    s.setPinned('q-1', true);
    const v1 = s.version();
    s.setPinned('q-1', false);
    expect(new Set([v, v1, s.version()]).size).toBe(3);
  });
});

describe('misfiles', () => {
  it('marks an item misfiled with its reason, archives it, and undoes both', () => {
    const s = new Store(':memory:');
    const [q] = s.take([{ kind: 'question', text: 'what?' }], null, {
      session: 's',
      harness: null,
      cwd: null,
      root: null,
      repo: null,
      transcript: null,
    });
    const marked = s.setMisfiled(q?.ref ?? '', true, '  rhetorical  ');
    expect(marked).toMatchObject({ misfiledWhy: 'rhetorical' });
    expect(marked?.archivedAt).not.toBeNull();
    expect(s.misfiles().map((i) => i.ref)).toEqual([q?.ref]);
    const undone = s.setMisfiled(q?.ref ?? '', false);
    expect(undone).toMatchObject({ misfiledAt: null, misfiledWhy: null, archivedAt: null });
    expect(s.misfiles()).toEqual([]);
  });

  it("archives a session's session-scope answers when it ends, and only those", () => {
    const { s } = store();
    s.take([q('is it live?'), q('why WAL?'), q('pinned one?'), t('owed task')], null, ctx);
    s.settle('q-1', 'answered', 'yes', [], { scope: 'session' });
    s.settle('q-2', 'answered', 'readers never block', [], { scope: 'durable' });
    s.settle('q-3', 'answered', 'kept', [], { scope: 'session' });
    s.setPinned('q-3');
    s.take([q('other session?')], null, { ...ctx, session: 's2' });
    s.settle('q-5', 'answered', 'yes', [], { scope: 'session' });
    expect(s.archiveEnded('s1')).toEqual(['q-1']);
    expect(
      s
        .list('inbox')
        .map((i) => i.ref)
        .sort(),
    ).toEqual(['q-2', 'q-3', 'q-5', 't-4']);
  });

  it('archives session-scope answers from sessions idle past the cutoff', () => {
    const { s, tick } = store();
    s.addTurn(ctx, 'is it live?');
    s.take([q('is it live?')], null, ctx);
    s.settle('q-1', 'answered', 'yes', [], { scope: 'session' });
    expect(s.archiveEnded(null, 1000)).toEqual([]);
    tick(1001);
    expect(s.archiveEnded(null, 1000)).toEqual(['q-1']);
  });
});
