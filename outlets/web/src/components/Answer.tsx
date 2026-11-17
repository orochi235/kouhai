import { useEffect, useMemo, useRef } from 'react';
import type { Item } from '../api.ts';
import { drawDiagrams } from '../diagrams.ts';
import { render } from '../markdown.ts';
import './Answer.css';
import './Code.css';

/** The note an item was settled with, or a line saying it is still owed. */
export function Answer({
  item: q,
  onSelect,
  onOpenPath,
}: {
  item: Item;
  onSelect: (ref: string) => void;
  onOpenPath: (q: Item, path: string) => void;
}) {
  const html = useMemo(() => (q.note ? render(q.note, q.ref) : ''), [q.note, q.ref]);
  const answer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (html && answer.current) drawDiagrams(answer.current);
  }, [html]);
  if (!q.note) {
    return (
      <p className="answer pending">
        {q.kind === 'task'
          ? "Still owed. Claude took this on and hasn't settled it."
          : "Claude has this question and hasn't answered it yet."}
      </p>
    );
  }
  return (
    <div
      ref={answer}
      className="answer"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        const href = a?.getAttribute('href') ?? '';
        const ref = a?.dataset.ref;
        if (ref) {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          onSelect(ref);
        } else if (href.startsWith('/') || href.startsWith('file://')) {
          e.preventDefault();
          onOpenPath(q, href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
