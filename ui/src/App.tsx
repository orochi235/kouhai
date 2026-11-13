import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Filter, type Item, type Listing } from './api.ts';
import './App.css';
import { MessageList } from './components/MessageList.tsx';
import { Reader } from './components/Reader.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { repoSheet } from './repoColors.ts';

const POLL_MS = 2000;

const initialRef = () => new URLSearchParams(location.search).get('q');

export function App() {
  const [filter, setFilter] = useState<Filter>('inbox');
  const [repo, setRepo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [selected, setSelected] = useState<string | null>(initialRef);
  const [offline, setOffline] = useState(false);
  const version = useRef('');
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const l = await api.list(filter, repo, text);
      version.current = l.version;
      setListing(l);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [filter, repo, text]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const { version: v } = await api.version();
        setOffline(false);
        if (v !== version.current) load();
      } catch {
        setOffline(true);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const items = listing?.items ?? [];
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
        repo={repo}
        counts={listing?.counts}
        repos={listing?.repos ?? []}
        offline={offline}
        onFilter={(f) => {
          setFilter(f);
          setRepo(null);
        }}
        onRepo={(r) => setRepo(r === repo ? null : r)}
        onReadAll={async () => {
          await api.post('read-all', {});
          load();
        }}
      />
      <MessageList
        items={items}
        selected={selected}
        filter={filter}
        text={text}
        searchRef={search}
        onText={setText}
        onSelect={setSelected}
      />
      <Reader
        item={current}
        onArchive={(q) => act('archive', q, !q.archivedAt)}
        onPin={(q) => act('pin', q, !q.pinned)}
        onUnread={(q) => act('read', q, !q.readAt)}
        onReveal={(q, ref) => api.post('reveal', { id: q.ref, ref })}
        onOpenPath={(q, path) => api.post('open-path', { id: q.ref, path })}
      />
    </div>
  );
}
