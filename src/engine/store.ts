import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ARCHIVE_TTL_MS, dbPath, TURN_TTL_MS } from './paths.ts';
import {
  type Attachment,
  type Context,
  type Filter,
  type Item,
  type Kind,
  OUTCOMES,
  type Outcome,
  type Turn,
} from './types.ts';

const TURNS = `
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session TEXT, harness TEXT, cwd TEXT, root TEXT, repo TEXT, transcript TEXT,
  prompt TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chased (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);`;

const ITEMS = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn TEXT,
  session TEXT, harness TEXT, cwd TEXT, root TEXT, repo TEXT, transcript TEXT,
  prompt TEXT,
  kind TEXT NOT NULL DEFAULT 'question',
  text TEXT NOT NULL,
  outcome TEXT,
  note TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  raised_at INTEGER NOT NULL,
  settled_at INTEGER,
  read_at INTEGER,
  archived_at INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  nagged INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_session ON items (session, outcome);`;

/** v1 kept only questions, in a `questions` table; each becomes a question item, ids unchanged. */
const FROM_QUESTIONS = `
ALTER TABLE questions RENAME TO items;
ALTER TABLE items RENAME COLUMN question TO text;
ALTER TABLE items RENAME COLUMN answer TO note;
ALTER TABLE items RENAME COLUMN asked_at TO raised_at;
ALTER TABLE items RENAME COLUMN answered_at TO settled_at;
ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'question';
ALTER TABLE items ADD COLUMN outcome TEXT;
UPDATE items SET outcome = 'answered' WHERE note IS NOT NULL;
DROP INDEX IF EXISTS questions_session;`;

type Row = Record<string, string | number | null>;

const PROMPT_CAP = 4000;

export const refOf = (kind: Kind, id: number) => `${kind === 'task' ? 't' : 'q'}-${id}`;

/** `q-17`, `t-17`, and `17` all name item 17. */
export function idOf(ref: string | number): number | null {
  if (typeof ref === 'number') return Number.isInteger(ref) ? ref : null;
  const m = /^(?:[qt]-)?(\d+)$/.exec(ref.trim());
  return m ? Number(m[1]) : null;
}

function toItem(r: Row): Item {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  const kind = (r.kind === 'task' ? 'task' : 'question') as Kind;
  return {
    id: Number(r.id),
    ref: refOf(kind, Number(r.id)),
    kind,
    text: String(r.text),
    outcome: s('outcome') as Outcome | null,
    note: s('note'),
    attachments: JSON.parse(String(r.attachments ?? '[]')) as Attachment[],
    session: s('session'),
    harness: s('harness'),
    cwd: s('cwd'),
    root: s('root'),
    repo: s('repo'),
    transcript: s('transcript'),
    prompt: s('prompt'),
    raisedAt: Number(r.raised_at),
    settledAt: n('settled_at'),
    readAt: n('read_at'),
    archivedAt: n('archived_at'),
    pinned: Boolean(r.pinned),
    updatedAt: Number(r.updated_at),
  };
}

const WHERE: Record<Filter, string> = {
  inbox: 'archived_at IS NULL',
  owed: 'archived_at IS NULL AND outcome IS NULL',
  unread: 'archived_at IS NULL AND outcome IS NOT NULL AND read_at IS NULL',
  pinned: 'pinned = 1',
  archived: 'archived_at IS NOT NULL',
  all: '1 = 1',
};

export class Store {
  db: DatabaseSync;
  now: () => number;

  constructor(path = dbPath(), now: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    this.db.exec(TURNS);
    this.migrate();
  }

  private has(table: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
    );
  }

  private migrate() {
    if (!this.has('items') && this.has('questions')) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(FROM_QUESTIONS);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
    this.db.exec(ITEMS);
  }

  close() {
    this.db.close();
  }

  addTurn(ctx: Context, prompt: string): Turn {
    const turn: Turn = {
      ...ctx,
      id: `turn-${randomBytes(4).toString('hex')}`,
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
    const s = (k: string) => (r[k] == null ? null : String(r[k]));
    return {
      id: String(r.id),
      session: s('session'),
      harness: s('harness'),
      cwd: s('cwd'),
      root: s('root'),
      repo: s('repo'),
      transcript: s('transcript'),
      prompt: String(r.prompt),
      at: Number(r.at),
    };
  }

  /** Files items under a turn's context, or under `fallback` when the turn is unknown. */
  take(items: { kind: Kind; text: string }[], turnId: string | null, fallback: Context): Item[] {
    const turn = turnId ? this.turn(turnId) : null;
    const ctx: Context = turn ?? fallback;
    const at = this.now();
    const insert = this.db.prepare(
      `INSERT INTO items (turn, session, harness, cwd, root, repo, transcript, prompt, kind, text, raised_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const out: Item[] = [];
    for (const { kind, text } of items) {
      const t = text.trim();
      if (!t) continue;
      const { lastInsertRowid } = insert.run(
        turn?.id ?? null,
        ctx.session,
        ctx.harness,
        ctx.cwd,
        ctx.root,
        ctx.repo,
        ctx.transcript,
        turn?.prompt ?? null,
        kind,
        t,
        at,
        at,
      );
      out.push(this.get(Number(lastInsertRowid)) as Item);
    }
    return out;
  }

  /**
   * Settles an item. Settling again replaces the outcome and note, adds attachments, and marks it
   * unread. Throws when the outcome doesn't fit the kind.
   */
  settle(
    ref: string | number,
    outcome: Outcome,
    note: string,
    attachments: Attachment[] = [],
  ): Item | null {
    const item = this.get(ref);
    if (!item) return null;
    const allowed = OUTCOMES[item.kind];
    if (!allowed.includes(outcome)) {
      throw new Error(`a ${item.kind} settles as ${allowed.join(', ')}, not ${outcome}`);
    }
    const merged = [...item.attachments];
    for (const a of attachments) {
      if (!merged.some((m) => m.kind === a.kind && m.ref === a.ref)) merged.push(a);
    }
    const at = this.now();
    this.db
      .prepare(
        'UPDATE items SET outcome = ?, note = ?, attachments = ?, settled_at = ?, read_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ?',
      )
      .run(outcome, note, JSON.stringify(merged), at, at, item.id);
    return this.get(item.id);
  }

  get(ref: string | number): Item | null {
    const id = idOf(ref);
    if (id == null) return null;
    const r = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Row | undefined;
    return r ? toItem(r) : null;
  }

  list(
    filter: Filter = 'inbox',
    opts: { repo?: string; text?: string; session?: string; limit?: number } = {},
  ) {
    const where = [WHERE[filter]];
    const args: string[] = [];
    if (opts.repo) {
      where.push('repo = ?');
      args.push(opts.repo);
    }
    if (opts.session) {
      where.push('session = ?');
      args.push(opts.session);
    }
    if (opts.text) {
      where.push('(text LIKE ? OR note LIKE ?)');
      args.push(`%${opts.text}%`, `%${opts.text}%`);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY COALESCE(settled_at, raised_at) DESC LIMIT ${opts.limit ?? 500}`,
      )
      .all(...args) as Row[];
    return rows.map(toItem);
  }

  private flag(ref: string | number, column: 'read_at' | 'archived_at', on: boolean) {
    const id = idOf(ref);
    if (id == null) return null;
    const at = this.now();
    this.db
      .prepare(`UPDATE items SET ${column} = ?, updated_at = ? WHERE id = ?`)
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
      .prepare('UPDATE items SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, this.now(), id);
    return this.get(id);
  }

  readAll(): number {
    const at = this.now();
    const { changes } = this.db
      .prepare(`UPDATE items SET read_at = ?, updated_at = ? WHERE ${WHERE.unread}`)
      .run(at, at);
    return Number(changes);
  }

  /** Items in a session still owed that nobody has chased yet. */
  unchased(session: string, since: number): Item[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM items WHERE session = ? AND outcome IS NULL AND archived_at IS NULL AND nagged = 0 AND raised_at >= ? ORDER BY id',
      )
      .all(session, since) as Row[];
    return rows.map(toItem);
  }

  markChased(ids: number[]) {
    const stmt = this.db.prepare('UPDATE items SET nagged = 1 WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }

  /** Marks a key (a mid-turn message's id) as chased; false when it already was. */
  chaseOnce(key: string): boolean {
    const { changes } = this.db
      .prepare('INSERT OR IGNORE INTO chased (key, at) VALUES (?, ?)')
      .run(key, this.now());
    return Number(changes) > 0;
  }

  counts() {
    const n = (w: string) =>
      Number((this.db.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${w}`).get() as Row).n);
    return { unread: n(WHERE.unread), owed: n(WHERE.owed), inbox: n(WHERE.inbox) };
  }

  /** Changes whenever anything a viewer could see changes, so a page can poll it cheaply. */
  version(): string {
    const r = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM items')
      .get() as Row;
    return `${r.n}:${r.t}`;
  }

  prune(): { items: number; turns: number } {
    const now = this.now();
    const q = this.db
      .prepare('DELETE FROM items WHERE archived_at IS NOT NULL AND archived_at < ? AND pinned = 0')
      .run(now - ARCHIVE_TTL_MS);
    const t = this.db
      .prepare(
        'DELETE FROM turns WHERE at < ? AND id NOT IN (SELECT turn FROM items WHERE turn IS NOT NULL)',
      )
      .run(now - TURN_TTL_MS);
    this.db.prepare('DELETE FROM chased WHERE at < ?').run(now - TURN_TTL_MS);
    return { items: Number(q.changes), turns: Number(t.changes) };
  }
}
