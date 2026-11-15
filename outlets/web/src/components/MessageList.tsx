import type { RefObject } from 'react';
import type { Filter, Item, Kind } from '../api.ts';
import { renderPreview } from '../markdown.ts';
import { repoClass } from '../repoColors.ts';
import type { Row } from '../thread.ts';
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

const EMPTY_BOX: Record<Kind, string> = {
  question: 'No questions. Ask Claude something mid-task and it lands here.',
  task: 'No tasks. Queue up work for Claude and it lands here.',
};

type Props = {
  rows: Row[];
  selected: string | null;
  filter: Filter;
  kind: Kind | null;
  text: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onText: (t: string) => void;
  onSelect: (ref: string) => void;
};

export function MessageList({
  rows,
  selected,
  filter,
  kind,
  text,
  searchRef,
  onText,
  onSelect,
}: Props) {
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
      {rows.length === 0 ? (
        <p className="empty">{filter === 'inbox' && kind ? EMPTY_BOX[kind] : EMPTY[filter]}</p>
      ) : (
        <ul className="items">
          {rows.map(({ item: q, reply }, i) => {
            const state = !q.outcome ? 'owed' : q.readAt ? 'read' : 'unread';
            return (
              <li key={q.ref} className={`item-${i < 12 ? i : 'late'}`}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-current={q.ref === selected}
                  className={`item ${state} ${reply ? 'reply' : ''} ${q.ref === selected ? 'selected' : ''}`}
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
                    <span className={`kind kind-${q.kind}`}>
                      {q.kind === 'task' ? 'task' : 'q'}
                    </span>
                    {q.repo && <span className={`chip ${repoClass(q.repo)}`}>{q.repo}</span>}
                    {q.outcome && q.outcome !== 'answered' && q.outcome !== 'done' && (
                      <span className={`outcome ${q.outcome}`}>{q.outcome}</span>
                    )}
                    {q.pinned && <span className="pin">pinned</span>}
                    <time>{age(q.settledAt ?? q.raisedAt)}</time>
                  </span>
                  <span className="q" dangerouslySetInnerHTML={{ __html: renderPreview(q.text) }} />
                  {q.note ? (
                    <span
                      className="a"
                      dangerouslySetInnerHTML={{ __html: renderPreview(q.note) }}
                    />
                  ) : (
                    <span className="a">
                      {q.kind === 'task' ? 'Still owed.' : 'Claude has not answered yet…'}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
