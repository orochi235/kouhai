import { Icon } from '@weasel-js/ui/components/Icon';
import type { RefObject } from 'react';
import type { Filter, Item, Kind, Tag } from '../api.ts';
import { icon } from '../icons.gen.ts';
import { renderPreview } from '../markdown.ts';
import { repoClass } from '../repoColors.ts';
import type { Press } from '../selection.ts';
import type { Row } from '../thread.ts';
import { age } from '../time.ts';
import './MessageList.css';
import { TagChips } from './Tags.tsx';

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
  /** Every selected row; more than one while a selection spans several. */
  picked: readonly string[];
  filter: Filter;
  kind: Kind | null;
  tags: Tag[];
  text: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onText: (t: string) => void;
  onSelect: (ref: string, e: Press) => void;
};

export function MessageList({
  rows,
  selected,
  picked,
  filter,
  kind,
  tags,
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
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
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
                  className={`item ${state} ${reply ? 'reply' : ''} ${q.ref === selected ? 'selected' : ''} ${picked.length > 1 && picked.includes(q.ref) ? 'picked' : ''}`}
                  onClick={(e) => onSelect(q.ref, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(q.ref, e);
                    }
                  }}
                >
                  <span className="mark" aria-label={state} />
                  <span className="meta">
                    <span className={`kind kind-${q.kind}`}>{q.ref}</span>
                    {q.repo && <span className={`chip ${repoClass(q.repo)}`}>{q.repo}</span>}
                    {q.outcome && q.outcome !== 'answered' && q.outcome !== 'done' && (
                      <span className={`outcome ${q.outcome}`}>{q.outcome}</span>
                    )}
                    {q.pinned && <span className="pin">pinned</span>}
                    <TagChips names={q.tags} tags={tags} />
                    <time>{age(q.settledAt ?? q.raisedAt)}</time>
                  </span>
                  <span className="q" dangerouslySetInnerHTML={{ __html: renderPreview(q.text) }} />
                  {q.note ? (
                    <span className="a">
                      {q.kind === 'task' && q.outcome === 'done' && (
                        <Icon name={icon('ui:check')} size={14} className="done" label="Done" />
                      )}
                      <span dangerouslySetInnerHTML={{ __html: renderPreview(q.note) }} />
                    </span>
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
