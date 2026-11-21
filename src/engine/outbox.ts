import type { DatabaseSync } from 'node:sqlite';

/** What happened to an item that adapters hear about. */
export type Event = 'filed' | 'settled';

/** An event not yet delivered to every adapter that wants it. */
export type Pending = {
  id: number;
  item: number;
  event: Event;
  /** Adapters that have it already, by name. */
  done: string[];
  attempts: number;
  error: string | null;
  failedAt: number | null;
};

/** Attempts before an event is given up on and left for someone to look at. */
export const MAX_ATTEMPTS = 10;
/** A given-up event is deleted this long after. */
const FAILED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const OUTBOX = `
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item INTEGER NOT NULL,
  event TEXT NOT NULL,
  done TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  error TEXT,
  failed_at INTEGER
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox (failed_at, next_at);`;

type Row = Record<string, string | number | null>;

const toPending = (r: Row): Pending => ({
  id: Number(r.id),
  item: Number(r.item),
  event: r.event as Event,
  done: JSON.parse(String(r.done)) as string[],
  attempts: Number(r.attempts),
  error: r.error == null ? null : String(r.error),
  failedAt: r.failed_at == null ? null : Number(r.failed_at),
});

/**
 * Events waiting for the daemon to hand to adapters. Capture writes them beside the item and
 * never waits on delivery; an adapter that is down gets them later, with backoff.
 */
export class Outbox {
  db: DatabaseSync;
  now: () => number;

  constructor(db: DatabaseSync, now: () => number) {
    this.db = db;
    this.now = now;
    db.exec(OUTBOX);
  }

  add(item: number, event: Event) {
    this.db
      .prepare('INSERT INTO outbox (item, event, next_at) VALUES (?, ?, ?)')
      .run(item, event, this.now());
  }

  /** Events ready for another attempt, oldest first, so an item's filing goes before its settling. */
  due(limit = 50): Pending[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM outbox WHERE failed_at IS NULL AND next_at <= ? ORDER BY id LIMIT ?',
        )
        .all(this.now(), limit) as Row[]
    ).map(toPending);
  }

  /** Events still owed to some adapter, given up on or not. */
  waiting(): Pending[] {
    return (this.db.prepare('SELECT * FROM outbox ORDER BY id').all() as Row[]).map(toPending);
  }

  finish(id: number) {
    this.db.prepare('DELETE FROM outbox WHERE id = ?').run(id);
  }

  /** Keeps what was delivered and tries the rest again later: 30 s, doubling, up to 6 h. */
  retry(id: number, done: string[], error: string) {
    const r = this.db.prepare('SELECT attempts FROM outbox WHERE id = ?').get(id) as
      | Row
      | undefined;
    if (!r) return;
    const attempts = Number(r.attempts) + 1;
    const at = this.now();
    const wait = Math.min(30_000 * 2 ** (attempts - 1), 6 * 60 * 60 * 1000);
    this.db
      .prepare(
        'UPDATE outbox SET done = ?, attempts = ?, error = ?, next_at = ?, failed_at = ? WHERE id = ?',
      )
      .run(
        JSON.stringify(done),
        attempts,
        error,
        at + wait,
        attempts >= MAX_ATTEMPTS ? at : null,
        id,
      );
  }

  prune() {
    this.db
      .prepare('DELETE FROM outbox WHERE failed_at IS NOT NULL AND failed_at < ?')
      .run(this.now() - FAILED_TTL_MS);
  }
}
