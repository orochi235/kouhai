import { flipLabel, type Toggle } from '../actions.ts';
import type { Item } from '../api.ts';
import './Bulk.css';

type Props = {
  items: readonly Item[];
  /** The item the reader would show; each button flips the way it would flip on this one. */
  lead: Item;
  onFlip: (path: Toggle) => void;
  onClear: () => void;
};

const PATHS: readonly Toggle[] = ['read', 'pin', 'archive'];

/** Stands in for the reader while several items are selected: what is picked, and what to do to all of it. */
export function Bulk({ items, lead, onFlip, onClear }: Props) {
  return (
    <article className="reader bulk">
      <p className="count">{items.length} selected</p>
      <p className="actions">
        {PATHS.map((path) => (
          <button key={path} type="button" className="quiet" onClick={() => onFlip(path)}>
            {flipLabel(path, lead)}
          </button>
        ))}
        <button type="button" className="quiet" onClick={onClear}>
          Clear selection <kbd>Esc</kbd>
        </button>
      </p>
    </article>
  );
}
