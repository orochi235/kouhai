import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ARCHIVE_TTL_MS, dbPath, TURN_TTL_MS } from './paths.ts';
import type { Attachment, Context, Filter, Question, Turn } from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session TEXT, harness TEXT, cwd TEXT, root TEXT, repo TEXT, transcript TEXT,
  prompt TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn TEXT,
  session TEXT, harness TEXT, cwd TEXT, root TEXT, repo TEXT, transcript TEXT,
  prompt TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  asked_at INTEGER NOT NULL,
  answered_at INTEGER,
  read_at INTEGER,
  archived_at INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  nagged INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_session ON questions (session, answered_at);
`;

type Row = Record<string, string | number | null>;

const PROMPT_CAP = 4000;

export const refOf = (id: number) => `q-${id}`;
export function idOf(ref: string | number): number | null {
  if (typeof ref === 'number') return Number.isInteger(ref) ? ref : null;
  const m = /^(?:q-)?(\d+)$/.exec(ref.trim());
  return m ? Number(m[1]) : null;
}

function toQuestion(r: Row): Question {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    id: Number(r.id),
    ref: refOf(Number(r.id)),
    question: String(r.question),
    answer: s('answer'),
    attachments: JSON.parse(String(r.attachments ?? '[]')) as Attachment[],
    session: s('session'),
    harness: s('harness'),
    cwd: s('cwd'),
    root: s('root'),
    repo: s('repo'),
    transcript: s('transcript'),
    prompt: s('prompt'),
    askedAt: Number(r.asked_at),
    answeredAt: n('answered_at'),
    readAt: n('read_at'),
    archivedAt: n('archived_at'),
    pinned: Boolean(r.pinned),
    updatedAt: Number(r.updated_at),
  };
}

const WHERE: Record<Filter, string> = {
  inbox: 'archived_at IS NULL',
  unread: 'archived_at IS NULL AND answer IS NOT NULL AND read_at IS NULL',
  waiting: 'archived_at IS NULL AND answer IS NULL',
  pinned: 'pinned = 1',
  archived: 'archived_at IS NOT NULL',
  all: '1 = 1',
};

export class Store {
  db: DatabaseSync;
  now: () => number;

  constructor(path = dbPath(), now: () => number = Date.now) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  addTurn(ctx: Context, prompt: string): Turn {
    const turn: Turn = {
      ...ctx,
      id: `t-${randomBytes(4).toString('hex')}`,
      prompt: prompt.slice(0, PROMPT_CAP),
      at: this.now(),
    };
    this.db
      .prepare(
        'INSERT INTO turns (id, session, harness, cwd, root, repo, transcript, prompt, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        turn.id,
        turn.session,
        turn.harness,
        turn.cwd,
        turn.root,
        turn.repo,
        turn.transcript,
        turn.prompt,
        turn.at,
      );
    return turn;
  }

  turn(id: string): Turn | null {
    const r = this.db.prepare('SELECT * FROM turns WHERE id = ?').get(id) as Row | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      session: r.session as string | null,
      harness: r.harness as string | null,
      cwd: r.cwd as string | null,
      root: r.root as string | null,
      repo: r.repo as string | null,
      transcript: r.transcript as string | null,
      prompt: String(r.prompt),
      at: Number(r.at),
    };
  }

  /** Records questions under a turn's context, or under `fallback` when the turn is unknown. */
  ask(questions: string[], turnId: string | null, fallback: Context): Question[] {
    const turn = turnId ? this.turn(turnId) : null;
    const ctx: Context = turn ?? fallback;
    const prompt = turn?.prompt ?? null;
    const at = this.now();
    const insert = this.db.prepare(
      `INSERT INTO questions (turn, session, harness, cwd, root, repo, transcript, prompt, question, asked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const out: Question[] = [];
    for (const q of questions) {
      const text = q.trim();
      if (!text) continue;
      const { lastInsertRowid } = insert.run(
        turn?.id ?? null,
        ctx.session,
        ctx.harness,
        ctx.cwd,
        ctx.root,
        ctx.repo,
        ctx.transcript,
        prompt,
        text,
        at,
        at,
      );
      out.push(this.get(Number(lastInsertRowid)) as Question);
    }
    return out;
  }

  /** Sets the answer. Answering again replaces the text, adds attachments, and marks it unread. */
  answer(ref: string | number, body: string, attachments: Attachment[] = []): Question | null {
    const q = this.get(ref);
    if (!q) return null;
    const merged = [...q.attachments];
    for (const a of attachments) {
      if (!merged.some((m) => m.kind === a.kind && m.ref === a.ref)) merged.push(a);
    }
    const at = this.now();
    this.db
      .prepare(
        'UPDATE questions SET answer = ?, attachments = ?, answered_at = ?, read_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ?',
      )
      .run(body, JSON.stringify(merged), at, at, q.id);
    return this.get(q.id);
  }

  get(ref: string | number): Question | null {
    const id = idOf(ref);
    if (id == null) return null;
    const r = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Row | undefined;
    return r ? toQuestion(r) : null;
  }

  list(filter: Filter = 'inbox', opts: { repo?: string; text?: string; limit?: number } = {}) {
    const where = [WHERE[filter]];
    const args: string[] = [];
    if (opts.repo) {
      where.push('repo = ?');
      args.push(opts.repo);
    }
    if (opts.text) {
      where.push('(question LIKE ? OR answer LIKE ?)');
      args.push(`%${opts.text}%`, `%${opts.text}%`);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY COALESCE(answered_at, asked_at) DESC LIMIT ${opts.limit ?? 500}`,
      )
      .all(...args) as Row[];
    return rows.map(toQuestion);
  }

  private flag(ref: string | number, column: 'read_at' | 'archived_at', on: boolean) {
    const id = idOf(ref);
    if (id == null) return null;
    const at = this.now();
    this.db
      .prepare(`UPDATE questions SET ${column} = ?, updated_at = ? WHERE id = ?`)
      .run(on ? at : null, at, id);
    return this.get(id);
  }

  setRead(ref: string | number, read = true) {
    return this.flag(ref, 'read_at', read);
  }

  setArchived(ref: string | number, archived = true) {
    return this.flag(ref, 'archived_at', archived);
  }

  setPinned(ref: string | number, pinned = true) {
    const id = idOf(ref);
    if (id == null) return null;
    this.db
      .prepare('UPDATE questions SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, this.now(), id);
    return this.get(id);
  }

  readAll(): number {
    const at = this.now();
    const { changes } = this.db
      .prepare(`UPDATE questions SET read_at = ?, updated_at = ? WHERE ${WHERE.unread}`)
      .run(at, at);
    return Number(changes);
  }

  /** Questions in a session still waiting on an answer that nobody has chased yet. */
  unchased(session: string, since: number): Question[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM questions WHERE session = ? AND answer IS NULL AND nagged = 0 AND asked_at >= ? ORDER BY id',
      )
      .all(session, since) as Row[];
    return rows.map(toQuestion);
  }

  markChased(ids: number[]) {
    const stmt = this.db.prepare('UPDATE questions SET nagged = 1 WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }

  counts() {
    const n = (w: string) =>
      Number((this.db.prepare(`SELECT COUNT(*) AS n FROM questions WHERE ${w}`).get() as Row).n);
    return { unread: n(WHERE.unread), waiting: n(WHERE.waiting), inbox: n(WHERE.inbox) };
  }

  /** Changes whenever anything a viewer could see changes, so a page can poll it cheaply. */
  version(): string {
    const r = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM questions')
      .get() as Row;
    return `${r.n}:${r.t}`;
  }

  prune(): { questions: number; turns: number } {
    const now = this.now();
    const q = this.db
      .prepare(
        'DELETE FROM questions WHERE archived_at IS NOT NULL AND archived_at < ? AND pinned = 0',
      )
      .run(now - ARCHIVE_TTL_MS);
    const t = this.db
      .prepare(
        'DELETE FROM turns WHERE at < ? AND id NOT IN (SELECT turn FROM questions WHERE turn IS NOT NULL)',
      )
      .run(now - TURN_TTL_MS);
    return { questions: Number(q.changes), turns: Number(t.changes) };
  }
}
