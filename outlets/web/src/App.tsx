import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Filter, type Item, type Kind, type Listing, watch } from './api.ts';
import './App.css';
import { MessageList } from './components/MessageList.tsx';
import { Reader } from './components/Reader.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { repoSheet } from './repoColors.ts';
import { thread } from './thread.ts';

const initialRef = () => new URLSearchParams(location.search).get('q');

export function App() {
  const [filter, setFilter] = useState<Filter>('inbox');
  const [kind, setKind] = useState<Kind | null>('question');
  const [repo, setRepo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [selected, setSelected] = useState<string | null>(initialRef);
  const [offline, setOffline] = useState(false);
  const [askMisfile, setAskMisfile] = useState(0);
  const version = useRef('');
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const l = await api.list(filter, kind, repo, text);
      version.current = l.version;
      setListing(l);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [filter, kind, repo, text]);

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
  const current = useMemo(() => items.find((q) => q.ref === selected) ?? null, [items, selected]);

  useEffect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set('q', selected);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }, [selected]);

  const act = useCallback(
    async (path: 'read' | 'archive' | 'pin', q: Item, on: boolean) => {
      const key = path === 'read' ? 'read' : path === 'archive' ? 'archived' : 'pinned';
      await api.post(path, { id: q.ref, [key]: on });
      load();
    },
    [load],
  );

  // Opening a settled item is reading it, once per settlement, so `u` can mark it unread again.
  const autoRead = useRef('');
  useEffect(() => {
    if (!current?.outcome) return;
    const key = `${current.ref}:${current.settledAt}`;
    if (key === autoRead.current) return;
    autoRead.current = key;
    if (!current.readAt) act('read', current, true);
  }, [current, act]);

  const move = useCallback(
    (step: number) => {
      if (!items.length) return;
      const i = items.findIndex((q) => q.ref === selected);
      const next = items[Math.min(items.length - 1, Math.max(0, i + step))];
      if (next) setSelected(next.ref);
    },
    [items, selected],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown') move(1);
      else if (e.key === 'k' || e.key === 'ArrowUp') move(-1);
      else if (e.key === '/') {
        e.preventDefault();
        search.current?.focus();
      } else if (current && e.key === 'e') {
        move(1);
        act('archive', current, !current.archivedAt);
      } else if (current && e.key === 'u') act('read', current, !current.readAt);
      else if (current && e.key === 'p') act('pin', current, !current.pinned);
      else if (current && e.key === 'm') setAskMisfile((n) => n + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, act, current]);

  return (
    <div className="app">
      <style>{repoSheet(listing?.repos ?? [])}</style>
      <Sidebar
        filter={filter}
        kind={kind}
        repo={repo}
        counts={listing?.counts}
        repos={listing?.repos ?? []}
        offline={offline}
        onFilter={(f, k) => {
          setFilter(f);
          setKind(k);
          setRepo(null);
        }}
        onRepo={(r) => setRepo(r === repo ? null : r)}
        onReadAll={async () => {
          await api.post('read-all', {});
          load();
        }}
      />
      <MessageList
        rows={rows}
        selected={selected}
        filter={filter}
        kind={kind}
        text={text}
        searchRef={search}
        onText={setText}
        onSelect={setSelected}
      />
      <Reader
        item={current}
        parent={items.find((q) => q.ref === current?.parent) ?? null}
        onSelect={setSelected}
        onArchive={(q) => act('archive', q, !q.archivedAt)}
        onPin={(q) => act('pin', q, !q.pinned)}
        onUnread={(q) => act('read', q, !q.readAt)}
        onReveal={(q, ref) => api.post('reveal', { id: q.ref, ref })}
        onOpenPath={(q, path) => api.post('open-path', { id: q.ref, path })}
        askMisfile={askMisfile}
        onMisfile={async (q, misfiled, why) => {
          if (misfiled && q.ref === current?.ref) move(1);
          await api.post('misfile', { id: q.ref, misfiled, why });
          load();
        }}
      />
    </div>
  );
}
