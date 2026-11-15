import type { Filter, Kind, Listing, Repo } from '../api.ts';
import { repoClass } from '../repoColors.ts';
import './Sidebar.css';

/** The two inboxes split the ledger by kind; the views below them span both. */
const BOXES: { filter: Filter; kind?: Kind; label: string; count?: keyof Listing['counts'] }[] = [
  { filter: 'inbox', kind: 'question', label: 'Questions', count: 'questions' },
  { filter: 'inbox', kind: 'task', label: 'Tasks', count: 'tasks' },
  { filter: 'unread', label: 'Unread', count: 'unread' },
  { filter: 'owed', label: 'Owed', count: 'owed' },
  { filter: 'pinned', label: 'Pinned' },
  { filter: 'archived', label: 'Archived' },
];

type Props = {
  filter: Filter;
  kind: Kind | null;
  repo: string | null;
  counts: Listing['counts'] | undefined;
  repos: Repo[];
  offline: boolean;
  onFilter: (f: Filter, kind: Kind | null) => void;
  onRepo: (r: string) => void;
  onReadAll: () => void;
};

export function Sidebar({
  filter,
  kind,
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
        {BOXES.map((b) => (
          <li key={b.label}>
            <button
              type="button"
              className={b.filter === filter && (b.kind ?? null) === kind ? 'active' : ''}
              onClick={() => onFilter(b.filter, b.kind ?? null)}
            >
              <span>{b.label}</span>
              {b.count && counts && counts[b.count] > 0 && (
                <span className={`count ${b.filter === 'unread' ? 'hot' : ''}`}>
                  {counts[b.count]}
                </span>
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
