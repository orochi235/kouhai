import { useMemo, useState } from 'react';
import type { Attachment, Item, Outcome, Tag } from '../api.ts';
import { imageUrl, isImagePath } from '../images.ts';
import { render } from '../markdown.ts';
import { repoClass } from '../repoColors.ts';
import { stamp } from '../time.ts';
import { Follows } from './Follows.tsx';
import { MisfileButton, MisfiledNote } from './Misfile.tsx';
import './Reader.css';
import { TagBar } from './Tags.tsx';

type Props = {
  item: Item | null;
  /** The listed item this one follows up on. */
  parent: Item | null;
  tags: Tag[];
  onTag: (q: Item, tag: string, on: boolean) => void;
  onSelect: (ref: string) => void;
  onArchive: (q: Item) => void;
  onPin: (q: Item) => void;
  onUnread: (q: Item) => void;
  onReveal: (q: Item, ref: string) => void;
  onOpenPath: (q: Item, path: string) => void;
  onMisfile: (q: Item, misfiled: boolean, why: string) => void;
  /** Bumped by the `m` key. */
  askMisfile: number;
};

const BRAINHOUSE = 'http://localhost:8765';

const STAMP: Record<Outcome, string> = {
  answered: 'Answered',
  done: 'Done',
  dropped: 'Dropped',
  deferred: 'Deferred',
};

const KIND: Record<Attachment['kind'], string> = {
  artifact: 'Artifact',
  url: 'Link',
  file: 'File',
  transom: 'On the wall',
};

/** A shell that reopens the session, each step on its own line, in the harness it ran under. */
export function resumeCommand(q: Item): string {
  const env = q.harness && q.harness !== 'claude' ? `CLAUDE_CONFIG_DIR=~/.${q.harness} ` : '';
  return `${q.cwd ? `cd '${q.cwd.replace(/'/g, "'\\''")}'\n` : ''}${env}claude --resume ${q.session}`;
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function Reader({
  item: q,
  parent,
  tags,
  onTag,
  onSelect,
  onArchive,
  onPin,
  onUnread,
  onReveal,
  onOpenPath,
  onMisfile,
  askMisfile,
}: Props) {
  const html = useMemo(() => (q?.note ? render(q.note, q.ref) : ''), [q?.note, q?.ref]);
  if (!q) {
    return (
      <article className="reader blank">
        <p>Pick a letter.</p>
      </article>
    );
  }
  return (
    <article className="reader" key={q.ref}>
      <div className="toolbar">
        <span className="ref">{q.ref}</span>
        <span className="spacer" />
        {q.outcome && (
          <button type="button" className="quiet" onClick={() => onUnread(q)}>
            {q.readAt ? 'Mark unread' : 'Mark read'}
          </button>
        )}
        <button type="button" className="quiet" onClick={() => onPin(q)}>
          {q.pinned ? 'Unpin' : 'Pin'}
        </button>
        <MisfileButton item={q} ask={askMisfile} onMisfile={onMisfile} />
        <button type="button" className="quiet" onClick={() => onArchive(q)}>
          {q.archivedAt ? 'Unarchive' : 'Archive'}
        </button>
      </div>

      <div className="sheet">
        <header className="envelope">
          <MisfiledNote item={q} />
          {q.parent && <Follows of={q.parent} parent={parent} onSelect={onSelect} />}
          <div className="re-row">
            <p className="re">{q.kind === 'task' ? 'You told it to' : 'You asked'}</p>
            {q.outcome && <span className={`stamp ${q.outcome}`}>{STAMP[q.outcome]}</span>}
          </div>
          <h2 className="headline">{q.text}</h2>
          <dl className="postmark-block">
            {q.repo && (
              <div>
                <dt>repo</dt>
                <dd>
                  <span className={`chip ${repoClass(q.repo)}`}>{q.repo}</span>
                </dd>
              </div>
            )}
            {q.harness && (
              <div>
                <dt>harness</dt>
                <dd>{q.harness}</dd>
              </div>
            )}
            <div>
              <dt>{q.kind === 'task' ? 'given' : 'asked'}</dt>
              <dd>{stamp(q.raisedAt)}</dd>
            </div>
            {q.settledAt && q.outcome && (
              <div>
                <dt>{q.outcome}</dt>
                <dd>{stamp(q.settledAt)}</dd>
              </div>
            )}
            {q.cwd && (
              <div className="wide">
                <dt>in</dt>
                <dd className="path">{q.cwd}</dd>
              </div>
            )}
          </dl>
          <TagBar item={q} tags={tags} onTag={onTag} />
        </header>

        {q.note ? (
          <div
            className="answer"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('a');
              const href = a?.getAttribute('href') ?? '';
              if (href.startsWith('/') || href.startsWith('file://')) {
                e.preventDefault();
                onOpenPath(q, href);
              }
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="answer pending">
            {q.kind === 'task'
              ? "Still owed. Claude took this on and hasn't settled it."
              : "Claude has this question and hasn't answered it yet."}
          </p>
        )}

        {q.attachments.length > 0 && (
          <section className="enclosures">
            <h3>Enclosed</h3>
            <ul>
              {q.attachments.map((a) => (
                <li key={`${a.kind}:${a.ref}`}>
                  <span className="kind">{KIND[a.kind]}</span>
                  {a.kind === 'artifact' || a.kind === 'url' ? (
                    <a href={a.ref} target="_blank" rel="noreferrer">
                      {a.label ?? a.ref}
                    </a>
                  ) : (
                    <>
                      <span className="path">{a.label ?? a.ref}</span>
                      <button type="button" className="quiet" onClick={() => onReveal(q, a.ref)}>
                        Show in Finder
                      </button>
                      {isImagePath(a.ref) && (
                        <img className="shot" src={imageUrl(q.ref, a.ref)} alt={a.label ?? ''} />
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {q.prompt && q.prompt.trim() !== q.text.trim() && (
          <details className="prompt">
            <summary>The whole prompt it came from</summary>
            <pre>{q.prompt}</pre>
          </details>
        )}

        <footer className="return">
          {q.session && <Copy text={resumeCommand(q)} label="Copy resume command" />}
          <a
            className="quiet"
            href={`${BRAINHOUSE}/?q=${encodeURIComponent((q.prompt ?? q.text).replace(/^\s*\?\?\s*/, '').slice(0, 60))}`}
            target="_blank"
            rel="noreferrer"
          >
            Find in brainhouse
          </a>
        </footer>
      </div>
    </article>
  );
}
