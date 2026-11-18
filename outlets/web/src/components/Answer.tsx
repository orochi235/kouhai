import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Item } from '../api.ts';
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
  const stale = useStale(q);
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
    <>
      {stale.length > 0 && (
        <p className="stale">
          May be out of date: since this was settled at <code>{q.head?.slice(0, 7)}</code>,{' '}
          {stale.length === 1 ? 'a file it cites has' : 'files it cites have'} changed:{' '}
          {stale.map((f, i) => (
            <span key={f}>
              {i > 0 && ', '}
              <code>{f}</code>
            </span>
          ))}
          .
        </p>
      )}
      {q.verdict && <p className="verdict">{q.verdict}</p>}
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
    </>
  );
}

/** The cited files changed since `q` was settled, asked for once per settlement. */
function useStale(q: Item): string[] {
  const [changed, setChanged] = useState<string[]>([]);
  const ask = Boolean(q.head && q.cites.length && q.scope !== 'session');
  useEffect(() => {
    setChanged([]);
    if (!ask) return;
    let live = true;
    api
      .stale(q.ref)
      .then((r) => live && setChanged(r.changed))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [q.ref, q.settledAt, ask]);
  return changed;
}
