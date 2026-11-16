import { useCallback, useMemo } from 'react';
import { api, type Item, type Tag, type TagEdit } from './api.ts';
import type { Step } from './undo.ts';

type Toggle = 'read' | 'archive' | 'pin';
const TOGGLES: Record<Toggle, { key: string; label: [string, string] }> = {
  read: { key: 'read', label: ['Mark read', 'Mark unread'] },
  archive: { key: 'archived', label: ['Archive', 'Unarchive'] },
  pin: { key: 'pinned', label: ['Pin', 'Unpin'] },
};

/** Everything the page changes, each as an undo step that knows how to take itself back. */
export function useActions(record: (step: Step) => void, load: () => void, tags: Tag[] = []) {
  const act = useCallback(
    (path: Toggle, q: Item, on: boolean, undoable = true) => {
      const { key, label } = TOGGLES[path];
      const send = (v: boolean) => () => api.post(path, { id: q.ref, [key]: v });
      if (!undoable) send(on)().then(load, load);
      else record({ label: `${label[on ? 0 : 1]} ${q.ref}`, run: send(on), back: send(!on) });
    },
    [load, record],
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
    () => ({ act, tag, editTag, misfile, readAll }),
    [act, tag, editTag, misfile, readAll],
  );
}
