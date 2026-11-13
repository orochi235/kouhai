import type { RefObject } from 'react';
import type { Filter, Item } from '../api.ts';
import { repoClass } from '../repoColors.ts';
import { age } from '../time.ts';
import './MessageList.css';

const EMPTY: Record<Filter, string> = {
  inbox: 'Nothing here. Ask Claude something mid-task, or queue up work, and it lands here.',
  unread: 'All caught up.',
  owed: 'Nobody owes you anything.',
  pinned: 'Nothing pinned. Press p on an item to keep it.',
  archived: 'Nothing archived.',
  all: 'Nothing yet.',
};

type Props = {
  items: Item[];
  selected: string | null;
  filter: Filter;
  text: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onText: (t: string) => void;
  onSelect: (ref: string) => void;
};

/** A note's opening, flattened, for the preview line. */
const preview = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

export function MessageList({ items, selected, filter, text, searchRef, onText, onSelect }: Props) {
  return (
    <section className="list">
      <div className="search">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search the ledger"
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      </div>
      {items.length === 0 ? (
        <p className="empty">{EMPTY[filter]}</p>
      ) : (
        <ul className="items">
          {items.map((q, i) => {
            const state = !q.outcome ? 'owed' : q.readAt ? 'read' : 'unread';
            return (
              <li key={q.ref} className={`item-${i < 12 ? i : 'late'}`}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-current={q.ref === selected}
                  className={`item ${state} ${q.ref === selected ? 'selected' : ''}`}
                  onClick={() => onSelect(q.ref)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(q.ref);
                    }
                  }}
                >
                  <span className="mark" aria-label={state} />
                  <span className="meta">
                    <span className={`kind ${q.kind}`}>{q.kind === 'task' ? 'task' : 'q'}</span>
                    {q.repo && <span className={`chip ${repoClass(q.repo)}`}>{q.repo}</span>}
                    {q.outcome && q.outcome !== 'answered' && q.outcome !== 'done' && (
                      <span className={`outcome ${q.outcome}`}>{q.outcome}</span>
                    )}
                    {q.pinned && <span className="pin">pinned</span>}
                    <time>{age(q.settledAt ?? q.raisedAt)}</time>
                  </span>
                  <span className="q">{q.text}</span>
                  <span className="a">
                    {q.note
                      ? preview(q.note)
                      : q.kind === 'task'
                        ? 'Still owed.'
                        : 'Claude has not answered yet…'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
