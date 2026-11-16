import { useCommand } from '@weasel-js/core';
import { createHistory, type Op } from '@weasel-js/history';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Run = () => Promise<unknown>;

/** One undoable thing the page did: how to do it, how to take it back, and what to call it. */
export type Step = { label: string; run: Run; back: Run; coalesceKey?: string };

const LIMIT = 100;

/**
 * The page's undo stack. Each step is a pair of API calls, run one after another so an undo never
 * overtakes the action it reverses; `reload` runs after each.
 */
export function useUndo(reload: () => void) {
  const [history] = useState(() =>
    createHistory(null, { historyLimit: LIMIT, coalesceWindowMs: 1500 }),
  );
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const op = useCallback((label: string, go: Run, undo: Run, coalesceKey?: string): Op => {
    const forward: Op = {
      label,
      ...(coalesceKey ? { coalesceKey } : {}),
      apply: () => {
        queue.current = queue.current
          .then(go)
          .catch(() => {})
          .then(() => reloadRef.current());
      },
      invert: () => op(label, undo, go),
    };
    return forward;
  }, []);

  const record = useCallback(
    ({ label, run, back, coalesceKey }: Step) =>
      history.apply(op(label, run, back, coalesceKey), label),
    [history, op],
  );
  /** Waits for every step sent so far, for a caller that must read the result. */
  const settled = useCallback(() => queue.current, []);

  const state = useSyncExternalStore(
    useCallback((fn: () => void) => history.subscribe(fn), [history]),
    () => `${history.canUndo()}:${history.canRedo()}`,
  );
  const [canUndo, canRedo] = state.split(':').map((s) => s === 'true');

  const group = 'Edit';
  useCommand('edit.undo', 'Undo', () => history.undo(), {
    group,
    keys: { kind: 'key', key: 'z', mods: { mod: true } },
    enabled: () => (history.canUndo() ? true : 'Nothing to undo'),
  });
  useCommand('edit.redo', 'Redo', () => history.redo(), {
    group,
    keys: { kind: 'key', key: 'z', mods: { mod: true, shift: true } },
    enabled: () => (history.canRedo() ? true : 'Nothing to redo'),
  });

  return {
    record,
    settled,
    undo: () => history.undo(),
    redo: () => history.redo(),
    canUndo: Boolean(canUndo),
    canRedo: Boolean(canRedo),
  };
}
