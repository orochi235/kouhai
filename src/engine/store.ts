import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dropEnclosures, keep, keepNote } from './enclosures.ts';
import { ARCHIVE_TTL_MS, dbPath, TURN_TTL_MS } from './paths.ts';
import { slugOf, slugRef } from './slug.ts';
import { HAS_TAG, ITEM_COLUMNS, Tags, tagNames } from './tags.ts';
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
  updated_at INTEGER NOT NULL,
  parent TEXT,
  misfiled_at INTEGER,
  misfiled_why TEXT
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

/** Bumped by trigger inside every write a viewer could see, whichever process makes it. */
const REVISION = `
CREATE TABLE IF NOT EXISTS revision (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL);
INSERT OR IGNORE INTO revision (id, n) VALUES (1, 0);
${['items', 'tags', 'item_tags']
  .flatMap((t) =>
    ['INSERT', 'UPDATE', 'DELETE'].map(
      (op) => `CREATE TRIGGER IF NOT EXISTS bump_${t}_${op.toLowerCase()} AFTER ${op} ON ${t}
BEGIN UPDATE revision SET n = n + 1 WHERE id = 1; END;`,
    ),
  )
  .join('\n')}`;

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
    slug: s('slug'),
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
    parent: s('parent'),
    misfiledAt: n('misfiled_at'),
    misfiledWhy: s('misfiled_why'),
    tags: tagNames(r.tag_names),
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
  tags: Tags;

  constructor(path = dbPath(), now: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    this.db.exec(TURNS);
    this.migrate();
    this.tags = new Tags(this.db, now);
    this.db.exec(REVISION);
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
    const cols = this.db.prepare('PRAGMA table_info(items)').all() as Row[];
    if (!cols.some((c) => c.name === 'parent'))
      this.db.exec('ALTER TABLE items ADD COLUMN parent TEXT');
    if (!cols.some((c) => c.name === 'misfiled_at'))
      this.db.exec(
        'ALTER TABLE items ADD COLUMN misfiled_at INTEGER; ALTER TABLE items ADD COLUMN misfiled_why TEXT',
      );
    if (!cols.some((c) => c.name === 'slug'))
      this.db.exec('ALTER TABLE items ADD COLUMN slug TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS items_slug ON items (slug)');
  }

  /** The id a ref names: `q-17`, `17`, `#cost-of-slugs`, or `cost-of-slugs`. */
  private idFor(ref: string | number): number | null {
    const id = idOf(ref);
    if (id != null || typeof ref === 'number') return id;
    const slug = slugRef(ref);
    if (!slug) return null;
    const r = this.db.prepare('SELECT id FROM items WHERE slug = ?').get(slug) as Row | undefined;
    return r ? Number(r.id) : null;
  }

  /** `slug` as given, or with `-2`, `-3`… when another item already holds it. */
  private freeSlug(raw: string | null | undefined): string | null {
    const base = raw ? slugOf(raw) : null;
    if (!base) return null;
    const taken = this.db.prepare('SELECT 1 FROM items WHERE slug = ?');
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      if (!taken.get(slug)) return slug;
    }
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

  /**
   * Files items under a turn's context, or under `fallback` when the turn is unknown. A `parent`
   * must name a settled item; it is stored as that item's ref.
   */
  take(
    items: { kind: Kind; text: string; parent?: string | null; slug?: string | null }[],
    turnId: string | null,
    fallback: Context,
  ): Item[] {
    const turn = turnId ? this.turn(turnId) : null;
    const ctx: Context = turn ?? fallback;
    const at = this.now();
    const insert = this.db.prepare(
      `INSERT INTO items (turn, session, harness, cwd, root, repo, transcript, prompt, kind, text, raised_at, updated_at, parent, slug)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const out: Item[] = [];
    for (const { kind, text, parent, slug } of items) {
      const t = text.trim();
      if (!t) continue;
      const p = parent ? this.get(parent) : null;
      if (parent && !p?.outcome) throw new Error(`parent ${parent} is not a settled item`);
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
        p?.ref ?? null,
        this.freeSlug(slug),
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
    for (const a of keep(item.id, attachments)) {
      if (!merged.some((m) => m.kind === a.kind && m.ref === a.ref)) merged.push(a);
    }
    const at = this.now();
    this.db
      .prepare(
        'UPDATE items SET outcome = ?, note = ?, attachments = ?, settled_at = ?, read_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ?',
      )
      .run(outcome, keepNote(item.id, note), JSON.stringify(merged), at, at, item.id);
    return this.get(item.id);
  }

  get(ref: string | number): Item | null {
    const id = this.idFor(ref);
    if (id == null) return null;
    const r = this.db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`).get(id) as
      | Row
      | undefined;
    return r ? toItem(r) : null;
  }

  list(
    filter: Filter = 'inbox',
    opts: {
      repo?: string;
      text?: string;
      session?: string;
      kind?: Kind;
      tag?: string;
      limit?: number;
    } = {},
  ) {
    const where = [WHERE[filter]];
    const args: string[] = [];
    if (opts.kind) {
      where.push('kind = ?');
      args.push(opts.kind);
    }
    if (opts.tag) {
      where.push(HAS_TAG);
      args.push(opts.tag);
    }
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
        `SELECT ${ITEM_COLUMNS} FROM items WHERE ${where.join(' AND ')} ORDER BY COALESCE(settled_at, raised_at) DESC LIMIT ${opts.limit ?? 500}`,
      )
      .all(...args) as Row[];
    return rows.map(toItem);
  }

  private flag(ref: string | number, column: 'read_at' | 'archived_at', on: boolean) {
    const id = this.idFor(ref);
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
    const id = this.idFor(ref);
    if (id == null) return null;
    this.db
      .prepare('UPDATE items SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, this.now(), id);
    return this.get(id);
  }

  /**
   * Marks an item as one that should never have been filed, with the user's reason, and archives
   * it; `false` undoes both. Recent misfiles teach later sessions what not to file.
   */
  setMisfiled(ref: string | number, misfiled = true, why: string | null = null) {
    const id = this.idFor(ref);
    if (id == null) return null;
    const at = this.now();
    this.db
      .prepare(
        'UPDATE items SET misfiled_at = ?, misfiled_why = ?, archived_at = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        misfiled ? at : null,
        misfiled ? why?.trim() || null : null,
        misfiled ? at : null,
        at,
        id,
      );
    return this.get(id);
  }

  /** The latest misfiles, newest first, for the filing instructions. */
  misfiles(limit = 10): Item[] {
    const rows = this.db
      .prepare(
        `SELECT ${ITEM_COLUMNS} FROM items WHERE misfiled_at IS NOT NULL ORDER BY misfiled_at DESC LIMIT ?`,
      )
      .all(limit) as Row[];
    return rows.map(toItem);
  }

  /** Marks every unread item read; returns their refs, so the page can mark them unread again. */
  readAll(): string[] {
    const at = this.now();
    const rows = this.db
      .prepare(
        `UPDATE items SET read_at = ?, updated_at = ? WHERE ${WHERE.unread} RETURNING id, kind`,
      )
      .all(at, at) as Row[];
    return rows.map((r) => refOf(r.kind as Kind, Number(r.id)));
  }

  /** When this session's latest turn began, or null for a session with no turns yet. */
  lastTurnAt(session: string): number | null {
    const r = this.db.prepare('SELECT MAX(at) AS at FROM turns WHERE session = ?').get(session) as
      | Row
      | undefined;
    return r?.at == null ? null : Number(r.at);
  }

  /** Items in a session settled since `since`, read or not, archived or not. */
  settledSince(session: string, since: number): Item[] {
    const rows = this.db
      .prepare(
        `SELECT ${ITEM_COLUMNS} FROM items WHERE session = ? AND outcome IS NOT NULL AND settled_at >= ? ORDER BY id`,
      )
      .all(session, since) as Row[];
    return rows.map(toItem);
  }

  /** Takes a settled item out of the inbox as already seen: read and archived at once. */
  clear(ref: string | number): Item | null {
    const id = this.idFor(ref);
    if (id == null) return null;
    const at = this.now();
    this.db
      .prepare(
        'UPDATE items SET read_at = ?, archived_at = ?, updated_at = ? WHERE id = ? AND outcome IS NOT NULL',
      )
      .run(at, at, at, id);
    return this.get(id);
  }

  /** Whether this session opened a turn for a prompt, so its message reached the filing rule. */
  heard(session: string, prompt: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM turns WHERE session = ? AND prompt = ?')
        .get(session, prompt.slice(0, PROMPT_CAP)),
    );
  }

  /** Whether a key was already chased, without marking it. */
  chased(key: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM chased WHERE key = ?').get(key));
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
    return {
      unread: n(WHERE.unread),
      owed: n(WHERE.owed),
      inbox: n(WHERE.inbox),
      questions: n(`${WHERE.inbox} AND kind = 'question'`),
      tasks: n(`${WHERE.inbox} AND kind = 'task'`),
    };
  }

  /** Changes whenever anything a viewer could see changes, so a page can poll it cheaply. */
  version(): string {
    return String((this.db.prepare('SELECT n FROM revision WHERE id = 1').get() as Row).n);
  }

  prune(): { items: number; turns: number } {
    const now = this.now();
    const gone = this.db
      .prepare(
        'DELETE FROM items WHERE archived_at IS NOT NULL AND archived_at < ? AND pinned = 0 RETURNING id',
      )
      .all(now - ARCHIVE_TTL_MS) as Row[];
    for (const r of gone) dropEnclosures(Number(r.id));
    const t = this.db
      .prepare(
        'DELETE FROM turns WHERE at < ? AND id NOT IN (SELECT turn FROM items WHERE turn IS NOT NULL)',
      )
      .run(now - TURN_TTL_MS);
    this.db.prepare('DELETE FROM chased WHERE at < ?').run(now - TURN_TTL_MS);
    this.tags.prune();
    return { items: gone.length, turns: Number(t.changes) };
  }
}
