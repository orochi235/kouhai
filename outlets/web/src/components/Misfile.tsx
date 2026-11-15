import { useEffect, useRef, useState } from 'react';
import type { Item } from '../api.ts';
import './Misfile.css';

type Props = {
  item: Item;
  /** Bumped by the `m` key, to open the reason field from the keyboard. */
  ask: number;
  onMisfile: (q: Item, misfiled: boolean, why: string) => void;
};

/** The toolbar control for "this shouldn't have been filed", with an optional reason. */
export function MisfileButton({ item: q, ask, onMisfile }: Props) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const first = useRef(ask);

  useEffect(() => {
    if (ask !== first.current && !q.misfiledAt) setOpen(true);
  }, [ask, q.misfiledAt]);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  if (q.misfiledAt)
    return (
      <button type="button" className="quiet" onClick={() => onMisfile(q, false, '')}>
        Not misfiled
      </button>
    );
  if (!open)
    return (
      <button
        type="button"
        className="quiet"
        title="This shouldn't have been filed (m)"
        onClick={() => setOpen(true)}
      >
        Misfiled
      </button>
    );
  return (
    <form
      className="misfile"
      onSubmit={(e) => {
        e.preventDefault();
        onMisfile(q, true, why);
        setOpen(false);
        setWhy('');
      }}
    >
      <input
        ref={field}
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Why not? (optional, Enter to mark)"
        aria-label="Why this shouldn't have been filed"
      />
      <button type="submit" className="quiet">
        Mark
      </button>
    </form>
  );
}

/** Says an item was marked misfiled, and why, so the archived view shows what it taught. */
export function MisfiledNote({ item: q }: { item: Item }) {
  if (!q.misfiledAt) return null;
  return (
    <p className="misfiled-note">
      <span className="chip">misfiled</span>
      {q.misfiledWhy ?? 'No reason given.'}
    </p>
  );
}
