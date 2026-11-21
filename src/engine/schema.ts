// The ledger's tables, and the steps that bring an older database up to them.
import type { DatabaseSync } from 'node:sqlite';

const TURNS = `
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session TEXT, harness TEXT, cwd TEXT, root TEXT, repo TEXT, transcript TEXT,
  prompt TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cursors (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chased (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
export const REVISION = `
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

/** Columns added since the table was first made, each with its type; added in place when missing. */
const ADDED: [string, string][] = [
  ['parent', 'TEXT'],
  ['misfiled_at', 'INTEGER'],
  ['misfiled_why', 'TEXT'],
  ['slug', 'TEXT'],
  ['verdict', 'TEXT'],
  ['basis', 'TEXT'],
  ['scope', 'TEXT'],
  ['head', 'TEXT'],
  ['cites', "TEXT NOT NULL DEFAULT '[]'"],
  ['via', 'TEXT'],
  ['usage', 'TEXT'],
  ['external', "TEXT NOT NULL DEFAULT '[]'"],
];

const has = (db: DatabaseSync, table: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

export function migrate(db: DatabaseSync) {
  db.exec(TURNS);
  if (!has(db, 'items') && has(db, 'questions')) {
    db.exec('BEGIN');
    try {
      db.exec(FROM_QUESTIONS);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  db.exec(ITEMS);
  const cols = new Set(
    (db.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map((c) => c.name),
  );
  for (const [name, type] of ADDED)
    if (!cols.has(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${type}`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS items_slug ON items (slug)');
}
