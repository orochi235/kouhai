import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dropEnclosures, keep, keepNote } from './enclosures.ts';
import { citesIn, headOf } from './git.ts';
import { Outbox } from './outbox.ts';
import { ARCHIVE_TTL_MS, dbPath, SESSION_IDLE_MS, TURN_TTL_MS } from './paths.ts';
import { RefScheme, requireRefFormat } from './refs.ts';
import { type Row, toItem, WHERE } from './rows.ts';
import { migrate, REVISION } from './schema.ts';
import { slugOf, slugRef } from './slug.ts';
import { HAS_TAG, ITEM_COLUMNS, Tags } from './tags.ts';
import {
  type Attachment,
  type Context,
  type External,
  type Filter,
  type Item,
  type Kind,
  OUTCOMES,
  type Outcome,
  SETTINGS,
  type Settings,
  type Settlement,
  type Turn,
  type Via,
} from './types.ts';

const PROMPT_CAP = 4000;

/** Settings that need more than a type check, each validating and returning the value it stores. */
const CHECKS: Partial<Record<keyof Settings, (v: unknown) => unknown>> = { refs: requireRefFormat };

export class Store {
  db: DatabaseSync;
  now: () => number;
  tags: Tags;
  outbox: Outbox;
  /** How refs are written and read, from the `refs` setting. */
  refs: RefScheme;

  constructor(path = dbPath(), now: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    migrate(this.db);
    this.tags = new Tags(this.db, now);
    this.outbox = new Outbox(this.db, now);
    this.db.exec(REVISION);
    this.refs = new RefScheme(this.settings().refs);
  }

  private toItem = (r: Row) => toItem(r, this.refs);

  /** Runs `fn` in one transaction, so an item and its outbox event are written together or not at all. */
  private atomically<T>(fn: () => T): T {
    // Inside a caller's transaction (`advance` files /btw items in one), its commit covers this.
    if (this.db.isTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** The id a ref names: `q-17`, `17`, `#cost-of-slugs`, or `cost-of-slugs`. */
  private idFor(ref: string | number): number | null {
    const id = this.refs.idOf(ref);
    if (id != null || typeof ref === 'number') return id;
    const slug = slugRef(ref);
    if (!slug) return null;
    const r = this.db.prepare('SELECT id FROM items WHERE slug = ?').get(slug) as Row | undefined;
    return r ? Number(r.id) : null;
  }

  /** `slug` as given, or with `-2`, `-3`… when another item already holds it. */
  private freeSlug(raw: string | null | undefined): string | null {
    const base = raw ? slugOf(raw) : null;
    if (!base || this.refs.idOf(base) != null) return null;
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
    items: {
      kind: Kind;
      text: string;
      parent?: string | null;
      slug?: string | null;
      via?: Via | null;
    }[],
    turnId: string | null,
    fallback: Context,
  ): Item[] {
    const turn = turnId ? this.turn(turnId) : null;
    const ctx: Context = turn ?? fallback;
    const at = this.now();
    const insert = this.db.prepare(
      `INSERT INTO items (turn, session, harness, cwd, root, repo, transcript, prompt, kind, text, raised_at, updated_at, parent, slug, via)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const out: Item[] = [];
    this.atomically(() => {
      for (const { kind, text, parent, slug, via } of items) {
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
          via ?? null,
        );
        this.outbox.add(Number(lastInsertRowid), 'filed');
        out.push(this.get(Number(lastInsertRowid)) as Item);
      }
    });
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
    extra: Settlement = {},
    usage: Record<string, unknown> | null = null,
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
    const kept = keepNote(item.id, note);
    const archive = outcome === 'done' && !item.pinned && this.settings().archiveDone;
    this.atomically(() => {
      this.db
        .prepare(
          `UPDATE items SET outcome = ?, note = ?, attachments = ?, verdict = ?, basis = ?, scope = ?, head = ?, cites = ?,
         usage = ?, settled_at = ?, read_at = NULL, archived_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          outcome,
          kept,
          JSON.stringify(merged),
          extra.verdict?.trim() || null,
          extra.basis ?? null,
          extra.scope ?? null,
          item.root ? headOf(item.root) : null,
          JSON.stringify(item.root ? citesIn(kept, item.root) : []),
          usage ? JSON.stringify(usage) : null,
          at,
          archive ? at : null,
          at,
          item.id,
        );
      this.outbox.add(item.id, 'settled');
    });
    return this.get(item.id);
  }

  /** The ledger's settings: each stored value, else its default. */
  settings(): Settings {
    const out: Record<string, unknown> = { ...SETTINGS };
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    for (const r of rows) if (Object.hasOwn(SETTINGS, r.key)) out[r.key] = JSON.parse(r.value);
    return out as Settings;
  }

  /** Stores one setting. Throws on a name it doesn't keep or a value of the wrong type. */
  setSetting(key: string, value: unknown): Settings {
    if (!Object.hasOwn(SETTINGS, key)) throw new Error(`no setting ${key}`);
    const want = typeof SETTINGS[key as keyof Settings];
    if (typeof value !== want) throw new Error(`${key} is a ${want}`);
    const stored = CHECKS[key as keyof Settings]?.(value) ?? value;
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(stored));
    const settings = this.settings();
    this.refs = new RefScheme(settings.refs);
    return settings;
  }

  /** Records where an adapter keeps the item, replacing what that adapter recorded before. */
  setExternal(id: number, at: External) {
    const item = this.get(id);
    if (!item) return;
    const external = [...item.external.filter((e) => e.adapter !== at.adapter), at];
    this.db
      .prepare('UPDATE items SET external = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(external), this.now(), id);
  }

  get(ref: string | number): Item | null {
    const id = this.idFor(ref);
    if (id == null) return null;
    const r = this.db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`).get(id) as
      | Row
      | undefined;
    return r ? this.toItem(r) : null;
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
    return rows.map(this.toItem);
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
    return rows.map(this.toItem);
  }

  /** Marks every unread item read; returns their refs, so the page can mark them unread again. */
  readAll(): string[] {
    const at = this.now();
    const rows = this.db
      .prepare(
        `UPDATE items SET read_at = ?, updated_at = ? WHERE ${WHERE.unread} RETURNING id, kind`,
      )
      .all(at, at) as Row[];
    return rows.map((r) => this.refs.refOf(r.kind as Kind, Number(r.id)));
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
    return rows.map(this.toItem);
  }

  /**
   * Archives what a finished session settled as `session` scope, unread or not; with no session,
   * every such item whose session has had no turn for `idleMs`, for sessions that ended unseen.
   */
  archiveEnded(session: string | null, idleMs = SESSION_IDLE_MS): string[] {
    const at = this.now();
    const where = session
      ? 'session = ?'
      : 'session IS NOT NULL AND COALESCE((SELECT MAX(t.at) FROM turns t WHERE t.session = items.session), settled_at) < ?';
    const rows = this.db
      .prepare(
        `UPDATE items SET archived_at = ?, updated_at = ? WHERE scope = 'session' AND outcome IS NOT NULL
         AND archived_at IS NULL AND pinned = 0 AND ${where} RETURNING id, kind`,
      )
      .all(at, at, session ?? at - idleMs) as Row[];
    return rows.map((r) => this.refs.refOf(r.kind as Kind, Number(r.id)));
  }

  /** Whether this session opened a turn for a prompt, so its message reached the filing rule. */
  heard(session: string, prompt: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM turns WHERE session = ? AND prompt = ?')
        .get(session, prompt.slice(0, PROMPT_CAP)),
    );
  }

  /**
   * Runs `step` with the cursor stored under `key` (null the first time) inside a write lock, and
   * stores what it returns, so two processes reading the same source never both take a stretch.
   */
  advance<T>(key: string, step: (at: number | null) => { at: number; out: T }): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = this.db.prepare('SELECT n FROM cursors WHERE key = ?').get(key) as Row | undefined;
      const { at, out } = step(r ? Number(r.n) : null);
      this.db
        .prepare(
          'INSERT INTO cursors (key, n) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET n = excluded.n',
        )
        .run(key, at);
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
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
    this.outbox.prune();
    return { items: gone.length, turns: Number(t.changes) };
  }
}
