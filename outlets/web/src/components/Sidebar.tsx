import type { Filter, Listing, Repo } from '../api.ts';
import { repoClass } from '../repoColors.ts';
import './Sidebar.css';

const FILTERS: { id: Filter; label: string; count?: keyof Listing['counts'] }[] = [
  { id: 'inbox', label: 'Ledger', count: 'inbox' },
  { id: 'unread', label: 'Unread', count: 'unread' },
  { id: 'owed', label: 'Owed', count: 'owed' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'archived', label: 'Archived' },
];

type Props = {
  filter: Filter;
  repo: string | null;
  counts: Listing['counts'] | undefined;
  repos: Repo[];
  offline: boolean;
  onFilter: (f: Filter) => void;
  onRepo: (r: string) => void;
  onReadAll: () => void;
};

export function Sidebar({
  filter,
  repo,
  counts,
  repos,
  offline,
  onFilter,
  onRepo,
  onReadAll,
}: Props) {
  return (
    <nav className="sidebar">
      <header className="masthead">
        <span className="postmark" aria-hidden="true" />
        <h1>dixeram</h1>
        <p className="tagline">what your agents owe you</p>
      </header>

      <ul className="filters">
        {FILTERS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={f.id === filter ? 'active' : ''}
              onClick={() => onFilter(f.id)}
            >
              <span>{f.label}</span>
              {f.count && counts && counts[f.count] > 0 && (
                <span className={`count ${f.id === 'unread' ? 'hot' : ''}`}>{counts[f.count]}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {repos.length > 0 && (
        <>
          <h2 className="rail-heading">Repositories</h2>
          <ul className="repos">
            {repos.map((r) => (
              <li key={r.repo}>
                <button
                  type="button"
                  className={`${repoClass(r.repo)} ${r.repo === repo ? 'active' : ''}`}
                  onClick={() => onRepo(r.repo)}
                >
                  <span className="swatch" aria-hidden="true" />
                  <span className="name">{r.repo}</span>
                  {r.owed > 0 && <span className="count">{r.owed}</span>}
                  {r.unread > 0 && <span className="count hot">{r.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="rail-foot">
        {counts && counts.unread > 0 && (
          <button type="button" className="quiet" onClick={onReadAll}>
            Mark all read
          </button>
        )}
        <p className="keys">
          <kbd>j</kbd>
          <kbd>k</kbd> move · <kbd>e</kbd> archive · <kbd>u</kbd> unread · <kbd>p</kbd> pin ·{' '}
          <kbd>/</kbd> search
        </p>
        {offline && <p className="offline">The daemon is not answering on :8771</p>}
      </footer>
    </nav>
  );
}
