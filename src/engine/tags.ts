import type { DatabaseSync } from 'node:sqlite';
import type { Tag } from './types.ts';

export const TAGS = `
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS item_tags (
  item INTEGER NOT NULL,
  tag INTEGER NOT NULL,
  PRIMARY KEY (item, tag)
);
CREATE INDEX IF NOT EXISTS item_tags_tag ON item_tags (tag);`;

/** An item row with its tag names, joined by the unit separator. */
export const ITEM_COLUMNS = `items.*, (SELECT group_concat(t.name, char(31)) FROM item_tags it
  JOIN tags t ON t.id = it.tag WHERE it.item = items.id) AS tag_names`;

/** Items carrying the tag named by the next bound argument. */
export const HAS_TAG =
  'id IN (SELECT it.item FROM item_tags it JOIN tags t ON t.id = it.tag WHERE t.name = ?)';

export const tagNames = (v: unknown) =>
  typeof v === 'string' && v ? v.split('\u001f').sort((a, b) => a.localeCompare(b)) : [];

/** New tags take these in turn; the user can recolor any. */
const PALETTE = ['#b5523b', '#3f6e8c', '#5b7f3a', '#8a5a9e', '#b8862b', '#2f7f77', '#9b4466'];

const NAME = /^[^\s,][^,]{0,31}$/;

export function tagName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!NAME.test(name)) throw new Error('a tag name is 1–32 characters, with no commas');
  return name;
}

const COLOR = /^#[0-9a-f]{6}$/i;

type Row = Record<string, string | number | null>;

/** The user's own labels: defined once, set on any item. Claude never sets them. */
export class Tags {
  private db: DatabaseSync;
  private now: () => number;

  constructor(db: DatabaseSync, now: () => number) {
    this.db = db;
    this.now = now;
    db.exec(TAGS);
  }

  all(): Tag[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.name, t.color, COUNT(i.id) AS n FROM tags t
         LEFT JOIN item_tags it ON it.tag = t.id
         LEFT JOIN items i ON i.id = it.item AND i.archived_at IS NULL
         GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
      )
      .all() as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      color: String(r.color),
      count: Number(r.n),
    }));
  }

  private find(name: string): Row | undefined {
    return this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as Row | undefined;
  }

  /** The tag by that name, made if it doesn't exist yet. */
  define(raw: unknown): Tag {
    const name = tagName(raw);
    if (!this.find(name)) {
      const n = Number((this.db.prepare('SELECT COUNT(*) AS n FROM tags').get() as Row).n);
      this.db
        .prepare('INSERT INTO tags (name, color, updated_at) VALUES (?, ?, ?)')
        .run(name, PALETTE[n % PALETTE.length] as string, this.now());
    }
    return this.get(name) as Tag;
  }

  get(name: string): Tag | null {
    return this.all().find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  /** Puts the tag on the item or takes it off; putting one on defines it if need be. */
  set(item: number, raw: unknown, on: boolean) {
    const name = tagName(raw);
    const tag = on ? this.define(name) : this.get(name);
    if (!tag) return;
    if (on)
      this.db
        .prepare('INSERT OR IGNORE INTO item_tags (item, tag) VALUES (?, ?)')
        .run(item, tag.id);
    else this.db.prepare('DELETE FROM item_tags WHERE item = ? AND tag = ?').run(item, tag.id);
    this.db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(this.now(), item);
  }

  rename(raw: unknown, to: unknown): Tag {
    const from = this.need(raw);
    const name = tagName(to);
    const clash = this.find(name);
    if (clash && Number(clash.id) !== from.id) throw new Error(`a tag named ${name} exists`);
    this.db
      .prepare('UPDATE tags SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, this.now(), from.id);
    return this.get(name) as Tag;
  }

  recolor(raw: unknown, color: unknown): Tag {
    const tag = this.need(raw);
    if (typeof color !== 'string' || !COLOR.test(color)) throw new Error('a color is #rrggbb');
    this.db
      .prepare('UPDATE tags SET color = ?, updated_at = ? WHERE id = ?')
      .run(color.toLowerCase(), this.now(), tag.id);
    return this.get(tag.name) as Tag;
  }

  /** Deletes the tag and takes it off every item. */
  remove(raw: unknown) {
    const tag = this.need(raw);
    this.db.prepare('DELETE FROM item_tags WHERE tag = ?').run(tag.id);
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
  }

  /** Drops tag links to items that no longer exist. */
  prune() {
    this.db.exec('DELETE FROM item_tags WHERE item NOT IN (SELECT id FROM items)');
  }

  /** Changes whenever a tag is made, renamed, recolored, or deleted. */
  version(): string {
    const r = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM tags')
      .get() as Row;
    return `${r.n}:${r.t}`;
  }

  private need(raw: unknown): Tag {
    const tag = this.get(tagName(raw));
    if (!tag) throw new Error(`no tag ${String(raw)}`);
    return tag;
  }
}
