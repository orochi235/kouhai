import type { RefObject } from 'react';
import type { Filter, Question } from '../api.ts';
import { repoClass } from '../repoColors.ts';
import { age } from '../time.ts';
import './MessageList.css';

const EMPTY: Record<Filter, string> = {
  inbox: 'Nothing here. Ask Claude something mid-task and the answer lands here.',
  unread: 'All caught up.',
  waiting: 'No questions waiting on an answer.',
  pinned: 'Nothing pinned. Press p on an answer to keep it.',
  archived: 'Nothing archived.',
  all: 'Nothing yet.',
};

type Props = {
  questions: Question[];
  selected: string | null;
  filter: Filter;
  text: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onText: (t: string) => void;
  onSelect: (ref: string) => void;
};

/** The first paragraph of an answer, flattened, for the preview line. */
const preview = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

export function MessageList({
  questions,
  selected,
  filter,
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
          placeholder="Search questions and answers"
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      </div>
      {questions.length === 0 ? (
        <p className="empty">{EMPTY[filter]}</p>
      ) : (
        <ul className="items">
          {questions.map((q, i) => {
            const state = !q.answer ? 'waiting' : q.readAt ? 'read' : 'unread';
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
                    {q.repo && <span className={`chip ${repoClass(q.repo)}`}>{q.repo}</span>}
                    {q.pinned && <span className="pin">pinned</span>}
                    <time>{age(q.answeredAt ?? q.askedAt)}</time>
                  </span>
                  <span className="q">{q.question}</span>
                  <span className="a">
                    {q.answer ? preview(q.answer) : 'Claude is still working on this…'}
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
