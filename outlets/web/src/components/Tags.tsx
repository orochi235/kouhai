import { useState } from 'react';
import type { Item, Tag, TagEdit } from '../api.ts';
import { inkFor } from '../repoColors.ts';
import './Tags.css';

const tagClass = (tags: Tag[], name: string) => {
  const t = tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return t ? `tag-${t.id}` : '';
};

/** One rule per tag carrying its color, so chips and swatches color themselves. */
export const tagSheet = (tags: Tag[]) =>
  tags.map((t) => `.tag-${t.id}{--chip-bg:${t.color};--chip-fg:${inkFor(t.color)}}`).join('\n');

export function TagChips({ names, tags }: { names: string[]; tags: Tag[] }) {
  return names.map((n) => (
    <span key={n} className={`chip tag ${tagClass(tags, n)}`}>
      {n}
    </span>
  ));
}

type BarProps = {
  item: Item;
  tags: Tag[];
  onTag: (q: Item, tag: string, on: boolean) => void;
};

/** An item's tags in the reader: each can come off, and any tag, new or old, can go on. */
export function TagBar({ item: q, tags, onTag }: BarProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const close = () => {
    setAdding(false);
    setName('');
  };
  const unused = tags.filter((t) => !q.tags.some((n) => n.toLowerCase() === t.name.toLowerCase()));
  return (
    <div className="tag-bar">
      {q.tags.map((n) => (
        <span key={n} className={`chip tag ${tagClass(tags, n)}`}>
          {n}
          <button
            type="button"
            className="untag"
            aria-label={`Remove tag ${n}`}
            onClick={() => onTag(q, n, false)}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <form
          className="tag-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onTag(q, name.trim(), true);
            close();
          }}
        >
          <input
            autoFocus
            list="tag-names"
            value={name}
            placeholder="tag"
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
            onBlur={close}
          />
          <datalist id="tag-names">
            {unused.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </form>
      ) : (
        <button type="button" className="quiet" onClick={() => setAdding(true)}>
          + Tag
        </button>
      )}
    </div>
  );
}

type RailProps = {
  tags: Tag[];
  active: string | null;
  onPick: (name: string) => void;
  onEdit: (body: TagEdit) => void;
};

/** The sidebar's tags: pick one to filter by it; the picked one can be renamed, recolored, or deleted. */
export function TagRail({ tags, active, onPick, onEdit }: RailProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [to, setTo] = useState('');
  if (!tags.length) return null;
  return (
    <>
      <h2 className="rail-heading">Tags</h2>
      <ul className="repos tags">
        {tags.map((t) => (
          <li key={t.id}>
            {renaming === t.name ? (
              <form
                className="tag-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (to.trim() && to.trim() !== t.name)
                    onEdit({ action: 'rename', name: t.name, to: to.trim() });
                  setRenaming(null);
                }}
              >
                <input
                  autoFocus
                  value={to}
                  maxLength={32}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={() => setRenaming(null)}
                />
              </form>
            ) : (
              <button
                type="button"
                className={`tag-${t.id} ${t.name === active ? 'active' : ''}`}
                onClick={() => onPick(t.name)}
              >
                <span className="swatch" aria-hidden="true" />
                <span className="name">{t.name}</span>
                {t.count > 0 && <span className="count">{t.count}</span>}
              </button>
            )}
            {t.name === active && renaming !== t.name && (
              <div className="tag-tools">
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setTo(t.name);
                    setRenaming(t.name);
                  }}
                >
                  Rename
                </button>
                <label className="quiet tag-color">
                  Color
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) =>
                      onEdit({ action: 'color', name: t.name, color: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => onEdit({ action: 'delete', name: t.name })}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
