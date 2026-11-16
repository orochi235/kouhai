import icons from 'virtual:weasel-icons';
import { EditorShell, useOpenPreferences } from '@weasel-js/editor';
import { IconRegistryProvider } from '@weasel-js/icons/react';
import { usePref } from '@weasel-js/prefs/react';
import { ShortcutSheet, useShortcutSheetCommand } from '@weasel-js/ui/components/ShortcutSheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type Filter,
  type Item,
  type Kind,
  type Listing,
  type TagEdit,
  watch,
} from './api.ts';
import './App.css';
import { useActions } from './actions.ts';
import { citation } from './citation.ts';
import { Bulk } from './components/Bulk.tsx';
import { MessageList } from './components/MessageList.tsx';
import { Panes } from './components/Panes.tsx';
import { Reader } from './components/Reader.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { tagSheet } from './components/Tags.tsx';
import { useInboxKeys } from './keys.ts';
import { prefs } from './prefs.ts';
import { repoSheet } from './repoColors.ts';
import { useListSelection } from './selection.ts';
import { thread } from './thread.ts';
import { useUndo } from './undo.ts';

const initialRef = () => new URLSearchParams(location.search).get('q');

export function App() {
  return (
    <IconRegistryProvider icons={icons}>
      <EditorShell prefs={prefs} shortcuts={null} contextMenus={false}>
        <Inbox />
      </EditorShell>
    </IconRegistryProvider>
  );
}

function Inbox() {
  const [filter, setFilter] = useState<Filter>('inbox');
  const [kind, setKind] = useState<Kind | null>(() => {
    const ref = initialRef();
    return ref ? (ref.startsWith('t-') ? 'task' : 'question') : prefs.get('inbox.openOn');
  });
  const [readOnOpen] = usePref(prefs, 'inbox.readOnOpen');
  const [sheet, setSheet] = useState(false);
  useShortcutSheetCommand(() => setSheet(true));
  const openPrefs = useOpenPreferences();
  const [repo, setRepo] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [offline, setOffline] = useState(false);
  const [askMisfile, setAskMisfile] = useState(0);
  const version = useRef('');
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const l = await api.list(filter, kind, repo, tag, text);
      version.current = l.version;
      setListing(l);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [filter, kind, repo, tag, text]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      watch(
        (v) => {
          if (v !== version.current) load();
        },
        (up) => setOffline(!up),
      ),
    [load],
  );

  const rows = useMemo(() => thread(listing?.items ?? []), [listing]);
  const items = useMemo(() => rows.map((r) => r.item), [rows]);
  const order = useMemo(() => items.map((q) => q.ref), [items]);
  const {
    current: selected,
    picked,
    press,
    go,
    all,
    collapse,
  } = useListSelection(order, initialRef());
  const current = useMemo(() => items.find((q) => q.ref === selected) ?? null, [items, selected]);
  // What an action applies to: every picked item, or the one the reader shows.
  const targets = useMemo(
    () =>
      picked.length > 1 ? items.filter((q) => picked.includes(q.ref)) : current ? [current] : [],
    [items, picked, current],
  );

  useEffect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set('q', selected);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }, [selected]);

  const undo = useUndo(load);
  const {
    act,
    flip,
    tag: tagItem,
    editTag,
    misfile,
    readAll,
  } = useActions(undo.record, load, listing?.tags);

  // Opening a settled item is reading it, once per settlement, so `u` can mark it unread again.
  const autoRead = useRef('');
  useEffect(() => {
    if (!readOnOpen || !current?.outcome) return;
    const key = `${current.ref}:${current.settledAt}`;
    if (key === autoRead.current) return;
    autoRead.current = key;
    if (!current.readAt) act('read', [current], true, false);
  }, [current, act, readOnOpen]);

  const move = useCallback(
    (step: number, extend = false) => {
      if (!order.length) return;
      const i = order.indexOf(selected ?? '');
      const next = order[Math.min(order.length - 1, Math.max(0, i + step))];
      if (next) go(next, extend);
    },
    [order, selected, go],
  );

  /** Moves the cursor past the targets, ahead of an action that takes them out of the list. */
  const leave = useCallback(() => {
    const gone = new Set(targets.map((q) => q.ref));
    const last = Math.max(...targets.map((q) => order.indexOf(q.ref)));
    const next = order.slice(last + 1).find((r) => !gone.has(r)) ?? order.find((r) => !gone.has(r));
    if (next) go(next);
  }, [targets, order, go]);

  const box = useCallback((k: Kind) => {
    setFilter('inbox');
    setKind(k);
    setRepo(null);
    setTag(null);
  }, []);

  useInboxKeys({
    current,
    move,
    selectAll: all,
    collapse,
    search: () => search.current?.focus(),
    archive: (q) => {
      leave();
      flip('archive', targets, q);
    },
    toggleRead: (q) => flip('read', targets, q),
    pin: (q) => flip('pin', targets, q),
    misfile: () => setAskMisfile((n) => n + 1),
    cite: () => void navigator.clipboard.writeText(citation(targets.map((q) => q.ref))),
    box,
  });

  const sidebar = (
    <Sidebar
      filter={filter}
      kind={kind}
      repo={repo}
      counts={listing?.counts}
      repos={listing?.repos ?? []}
      tags={listing?.tags ?? []}
      tag={tag}
      onTag={(t) => setTag(t === tag ? null : t)}
      onEditTag={(body) => {
        editTag(body);
        if (tag === body.name && body.action === 'rename') setTag(body.to ?? null);
        else if (tag === body.name && body.action === 'delete') setTag(null);
      }}
      offline={offline}
      onFilter={(f, k) => {
        setFilter(f);
        setKind(k);
        setRepo(null);
        setTag(null);
      }}
      onRepo={(r) => setRepo(r === repo ? null : r)}
      onReadAll={readAll}
      onUndo={undo.canUndo ? undo.undo : undefined}
      onRedo={undo.canRedo ? undo.redo : undefined}
      onShortcuts={() => setSheet(true)}
      onPreferences={openPrefs}
    />
  );
  const list = (
    <MessageList
      rows={rows}
      selected={selected}
      picked={picked}
      filter={filter}
      kind={kind}
      tags={listing?.tags ?? []}
      text={text}
      searchRef={search}
      onText={setText}
      onSelect={press}
    />
  );
  const reader =
    targets.length > 1 && current ? (
      <Bulk
        items={targets}
        lead={current}
        onFlip={(path) => {
          if (path === 'archive') leave();
          flip(path, targets, current);
        }}
        onClear={collapse}
      />
    ) : (
      <Reader
        item={current}
        parent={items.find((q) => q.ref === current?.parent) ?? null}
        tags={listing?.tags ?? []}
        onTag={tagItem}
        onSelect={(ref) => go(ref)}
        onArchive={(q) => flip('archive', [q], q)}
        onPin={(q) => flip('pin', [q], q)}
        onUnread={(q) => flip('read', [q], q)}
        onReveal={(q, ref) => api.post('reveal', { id: q.ref, ref })}
        onOpenPath={(q, path) => api.post('open-path', { id: q.ref, path })}
        askMisfile={askMisfile}
        onMisfile={(q, misfiled, why) => {
          if (misfiled && q.ref === current?.ref) move(1);
          misfile(q, misfiled, why);
        }}
      />
    );

  return (
    <div className="app">
      <style>{`${repoSheet(listing?.repos ?? [])}\n${tagSheet(listing?.tags ?? [])}`}</style>
      <Panes
        panes={[
          { id: 'sidebar', node: sidebar, share: 0.17, min: 180 },
          { id: 'list', node: list, share: 0.3, min: 260 },
          { id: 'reader', node: reader, min: 360 },
        ]}
      />
      <ShortcutSheet open={sheet} onOpenChange={setSheet} tools={null} />
    </div>
  );
}
