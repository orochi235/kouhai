import type { DatabaseSync } from 'node:sqlite';
import type { Spend } from './meter.ts';
import { ARCHIVE_TTL_MS } from './paths.ts';

const COSTS = `
CREATE TABLE IF NOT EXISTS turn_costs (
  turn TEXT PRIMARY KEY,
  session TEXT NOT NULL, harness TEXT, repo TEXT, model TEXT,
  at INTEGER NOT NULL,
  calls INTEGER NOT NULL, input INTEGER NOT NULL, cache_read INTEGER NOT NULL,
  cache_write INTEGER NOT NULL, cache_write_1h INTEGER NOT NULL, output INTEGER NOT NULL,
  kouhai_added INTEGER NOT NULL, kouhai_output INTEGER NOT NULL, kouhai_read INTEGER NOT NULL,
  trips INTEGER NOT NULL, trip_read INTEGER NOT NULL,
  agents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS turn_costs_at ON turn_costs (at);
CREATE TABLE IF NOT EXISTS meters (
  key TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  live REAL NOT NULL,
  at INTEGER NOT NULL
);`;

/** Count columns added after the table was first made, each added in place when missing. */
const COUNTS = ['cache_write_1h', 'kouhai_output'];

/** How far into a transcript its cost has been counted, and the kouhai tokens in context there. */
export type Meter = { offset: number; live: number };

/** One day's turns, summed. */
export type Day = {
  day: string;
  turns: number;
  calls: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  output: number;
  kouhaiAdded: number;
  kouhaiOutput: number;
  kouhaiRead: number;
  trips: number;
  tripRead: number;
};

type Row = Record<string, string | number | null>;

/**
 * What each turn cost in tokens, counted by the Stop hook from the transcript. A subagent's run is
 * added to the turn that started it. Kept as long as an archived answer.
 */
export class Costs {
  db: DatabaseSync;
  now: () => number;

  constructor(db: DatabaseSync, now: () => number) {
    this.db = db;
    this.now = now;
    db.exec(COSTS);
    const has = new Set(
      (db.prepare('PRAGMA table_info(turn_costs)').all() as { name: string }[]).map((c) => c.name),
    );
    for (const c of COUNTS)
      if (!has.has(c)) db.exec(`ALTER TABLE turn_costs ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 0`);
  }

  meterOf(key: string): Meter | null {
    const r = this.db.prepare('SELECT offset, live FROM meters WHERE key = ?').get(key) as
      | Row
      | undefined;
    return r ? { offset: Number(r.offset), live: Number(r.live) } : null;
  }

  /**
   * Adds `spend` to the session's latest turn and moves the meter, in one transaction. Nothing is
   * added when the session has no turn on record, but the meter still moves.
   */
  record(key: string, session: string, spend: Spend, at: Meter, agent = false) {
    const now = this.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (spend.calls)
        this.db
          .prepare(
            `INSERT INTO turn_costs (turn, session, harness, repo, model, at, calls, input, cache_read, cache_write,
               cache_write_1h, output, kouhai_added, kouhai_output, kouhai_read, trips, trip_read, agents)
             SELECT id, session, harness, repo, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
               FROM turns WHERE session = ? ORDER BY at DESC LIMIT 1
             ON CONFLICT (turn) DO UPDATE SET
               model = coalesce(excluded.model, model), at = excluded.at,
               calls = calls + excluded.calls, input = input + excluded.input,
               cache_read = cache_read + excluded.cache_read, cache_write = cache_write + excluded.cache_write,
               cache_write_1h = cache_write_1h + excluded.cache_write_1h,
               output = output + excluded.output, kouhai_added = kouhai_added + excluded.kouhai_added,
               kouhai_output = kouhai_output + excluded.kouhai_output,
               kouhai_read = kouhai_read + excluded.kouhai_read, trips = trips + excluded.trips,
               trip_read = trip_read + excluded.trip_read, agents = agents + excluded.agents`,
          )
          .run(
            spend.model,
            now,
            spend.calls,
            spend.input,
            spend.cacheRead,
            spend.cacheWrite,
            spend.cacheWrite1h,
            spend.output,
            Math.round(spend.kouhaiAdded),
            Math.round(spend.kouhaiOutput),
            Math.round(spend.kouhaiRead),
            spend.trips,
            spend.tripRead,
            agent ? 1 : 0,
            session,
          );
      this.db
        .prepare(
          `INSERT INTO meters (key, offset, live, at) VALUES (?, ?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET offset = excluded.offset, live = excluded.live, at = excluded.at`,
        )
        .run(key, at.offset, at.live, now);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** One turn's cost, or null when none was counted. */
  turn(id: string): Row | null {
    return (
      (this.db.prepare('SELECT * FROM turn_costs WHERE turn = ?').get(id) as Row | undefined) ??
      null
    );
  }

  /** Each day since `since`, oldest first, in local time. */
  days(since: number, repo?: string): Day[] {
    const rows = this.db
      .prepare(
        `SELECT date(at / 1000, 'unixepoch', 'localtime') AS day, count(*) AS turns, sum(calls) AS calls,
           sum(input) AS input, sum(cache_read) AS cacheRead, sum(cache_write) AS cacheWrite, sum(cache_write_1h) AS cacheWrite1h,
           sum(output) AS output, sum(kouhai_added) AS kouhaiAdded,
           sum(kouhai_output) AS kouhaiOutput, sum(kouhai_read) AS kouhaiRead, sum(trips) AS trips,
           sum(trip_read) AS tripRead
         FROM turn_costs WHERE at >= ? AND (? IS NULL OR repo = ?) GROUP BY day ORDER BY day`,
      )
      .all(since, repo ?? null, repo ?? null) as Row[];
    return rows.map((r) => ({
      day: String(r.day),
      turns: Number(r.turns),
      calls: Number(r.calls),
      input: Number(r.input),
      cacheRead: Number(r.cacheRead),
      cacheWrite: Number(r.cacheWrite),
      cacheWrite1h: Number(r.cacheWrite1h),
      output: Number(r.output),
      kouhaiAdded: Number(r.kouhaiAdded),
      kouhaiOutput: Number(r.kouhaiOutput),
      kouhaiRead: Number(r.kouhaiRead),
      trips: Number(r.trips),
      tripRead: Number(r.tripRead),
    }));
  }

  prune() {
    const before = this.now() - ARCHIVE_TTL_MS;
    this.db.prepare('DELETE FROM turn_costs WHERE at < ?').run(before);
    this.db.prepare('DELETE FROM meters WHERE at < ?').run(before);
  }
}
