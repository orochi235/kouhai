import { useCallback, useMemo } from 'react';
import { api, type Item, type Tag, type TagEdit } from './api.ts';
import type { Step } from './undo.ts';

export type Toggle = 'read' | 'archive' | 'pin';
const TOGGLES: Record<Toggle, { key: string; label: [string, string]; on: (q: Item) => boolean }> =
  {
    read: { key: 'read', label: ['Mark read', 'Mark unread'], on: (q) => !!q.readAt },
    archive: { key: 'archived', label: ['Archive', 'Unarchive'], on: (q) => !!q.archivedAt },
    pin: { key: 'pinned', label: ['Pin', 'Unpin'], on: (q) => q.pinned },
  };

/** What flipping `path` on `lead` would do, as its button says it. */
export const flipLabel = (path: Toggle, lead: Item) =>
  TOGGLES[path].label[TOGGLES[path].on(lead) ? 1 : 0];

/** Everything the page changes, each as an undo step that knows how to take itself back. */
export function useActions(record: (step: Step) => void, load: () => void, tags: Tag[] = []) {
  /** Sets `path` to `on` on every item in `qs`; undo puts each back as it was. */
  const act = useCallback(
    (path: Toggle, qs: readonly Item[], on: boolean, undoable = true) => {
      const { key, label, on: was } = TOGGLES[path];
      const send = (q: Item, v: boolean) => api.post(path, { id: q.ref, [key]: v });
      const run = () => Promise.all(qs.map((q) => send(q, on)));
      if (!undoable) return void run().then(load, load);
      const what = qs.length === 1 ? qs[0]?.ref : `${qs.length} items`;
      record({
        label: `${label[on ? 0 : 1]} ${what}`,
        run,
        back: () => Promise.all(qs.map((q) => send(q, was(q)))),
      });
    },
    [load, record],
  );

  /** Flips `path` on `qs` the way it would flip on `lead`, the item the reader shows. */
  const flip = useCallback(
    (path: Toggle, qs: readonly Item[], lead: Item) => act(path, qs, !TOGGLES[path].on(lead)),
    [act],
  );

  const tag = useCallback(
    (q: Item, t: string, on: boolean) => {
      const fresh = on && !tags.some((x) => x.name.toLowerCase() === t.toLowerCase());
      const send = (v: boolean) => () => api.post('tag', { id: q.ref, tag: t, on: v });
      record({
        label: `${on ? 'Tag' : 'Untag'} ${q.ref} ${t}`,
        run: send(on),
        // Taking off a tag this step made also deletes it, so undo leaves no empty tag behind.
        back: fresh
          ? () => send(false)().then(() => api.post('tags', { action: 'delete', name: t }))
          : send(!on),
      });
    },
    [record, tags],
  );

  const editTag = useCallback(
    (body: TagEdit) => {
      const post = (b: object) => () => api.post('tags', b);
      if (body.action === 'rename' && body.to) {
        const back = { action: 'rename', name: body.to, to: body.name };
        record({ label: `Rename tag ${body.name}`, run: post(body), back: post(back) });
      } else if (body.action === 'color') {
        const was = tags.find((t) => t.name === body.name)?.color;
        if (!was) return;
        record({
          label: `Recolor tag ${body.name}`,
          run: post(body),
          back: post({ action: 'color', name: body.name, color: was }),
          coalesceKey: `color:${body.name}`,
        });
      } else if (body.action === 'delete') {
        let gone: object = {};
        record({
          label: `Delete tag ${body.name}`,
          run: async () => {
            gone = (await api.post('tags', body)) as object;
          },
          back: () => api.post('tags', { ...gone, action: 'restore', name: body.name }),
        });
      }
    },
    [record, tags],
  );

  const misfile = useCallback(
    (q: Item, misfiled: boolean, why: string | null) => {
      const send = (m: boolean, w: string | null) => () =>
        api.post('misfile', { id: q.ref, misfiled: m, why: w });
      record({
        label: `${misfiled ? 'Mark' : 'Unmark'} ${q.ref} misfiled`,
        run: send(misfiled, why),
        back: send(!misfiled, q.misfiledWhy),
      });
    },
    [record],
  );

  const readAll = useCallback(() => {
    let refs: string[] = [];
    record({
      label: 'Mark all read',
      run: async () => {
        refs = ((await api.post('read-all', {})) as { refs: string[] }).refs;
      },
      back: () => Promise.all(refs.map((id) => api.post('read', { id, read: false }))),
    });
  }, [record]);

  return useMemo(
    () => ({ act, flip, tag, editTag, misfile, readAll }),
    [act, flip, tag, editTag, misfile, readAll],
  );
}
