import { intentOf, type Selection, select } from '@weasel-js/select';
import { useCallback, useMemo, useState } from 'react';

/** A list's convention: Cmd/Ctrl toggles a row, Shift ranges from the anchor. */
const POLICY = { mode: 'multi', toggle: ['meta', 'ctrl'], range: 'shift' } as const;

export type Press = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/**
 * The list's selection: `current` is the row the reader shows and the keys move from; `picked` is
 * every selected row still in `order`, which actions apply to.
 */
export function useListSelection(order: readonly string[], initial: string | null) {
  const [sel, setSel] = useState<Selection<string>>({
    ids: initial ? [initial] : [],
    anchor: initial,
  });
  const [current, setCurrent] = useState(initial);

  const press = useCallback(
    (ref: string, e: Press) => {
      const mods = { shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };
      setSel((s) => select(s, ref, intentOf(mods, POLICY), { order }));
      setCurrent(ref);
    },
    [order],
  );

  /** Moves to `ref`, alone, or extending the range from the anchor. */
  const go = useCallback(
    (ref: string, extend = false) => {
      setSel((s) => select(s, ref, extend ? 'range' : 'replace', { order }));
      setCurrent(ref);
    },
    [order],
  );

  const all = useCallback(
    () => setSel((s) => ({ ids: order, anchor: s.anchor ?? order[0] ?? null })),
    [order],
  );

  const collapse = useCallback(
    () => setSel({ ids: current ? [current] : [], anchor: current }),
    [current],
  );

  const picked = useMemo(() => {
    const kept = new Set(order);
    return sel.ids.filter((id) => kept.has(id));
  }, [sel, order]);

  return { current, picked, press, go, all, collapse };
}
