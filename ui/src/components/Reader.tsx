import { useMemo, useState } from 'react';
import type { Attachment, Question } from '../api.ts';
import { render } from '../markdown.ts';
import { repoClass } from '../repoColors.ts';
import { stamp } from '../time.ts';
import './Reader.css';

type Props = {
  question: Question | null;
  onArchive: (q: Question) => void;
  onPin: (q: Question) => void;
  onUnread: (q: Question) => void;
  onReveal: (q: Question, ref: string) => void;
};

const BRAINHOUSE = 'http://localhost:8765';

const KIND: Record<Attachment['kind'], string> = {
  artifact: 'Artifact',
  url: 'Link',
  file: 'File',
  transom: 'On the wall',
};

/** A shell that reopens the session, each step on its own line, in the harness it ran under. */
export function resumeCommand(q: Question): string {
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

export function Reader({ question: q, onArchive, onPin, onUnread, onReveal }: Props) {
  const html = useMemo(() => (q?.answer ? render(q.answer) : ''), [q?.answer]);
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
        {q.answer && (
          <button type="button" className="quiet" onClick={() => onUnread(q)}>
            {q.readAt ? 'Mark unread' : 'Mark read'}
          </button>
        )}
        <button type="button" className="quiet" onClick={() => onPin(q)}>
          {q.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" className="quiet" onClick={() => onArchive(q)}>
          {q.archivedAt ? 'Unarchive' : 'Archive'}
        </button>
      </div>

      <div className="sheet">
        <header className="envelope">
          <p className="re">You asked</p>
          <h2 className="question">{q.question}</h2>
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
              <dt>asked</dt>
              <dd>{stamp(q.askedAt)}</dd>
            </div>
            {q.answeredAt && (
              <div>
                <dt>answered</dt>
                <dd>{stamp(q.answeredAt)}</dd>
              </div>
            )}
            {q.cwd && (
              <div className="wide">
                <dt>in</dt>
                <dd className="path">{q.cwd}</dd>
              </div>
            )}
          </dl>
        </header>

        {q.answer ? (
          <div className="answer" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="answer pending">Claude has this question and hasn't answered it yet.</p>
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
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {q.prompt && q.prompt.trim() !== q.question.trim() && (
          <details className="prompt">
            <summary>The whole prompt it came from</summary>
            <pre>{q.prompt}</pre>
          </details>
        )}

        <footer className="return">
          {q.session && <Copy text={resumeCommand(q)} label="Copy resume command" />}
          <a
            className="quiet"
            href={`${BRAINHOUSE}/?q=${encodeURIComponent((q.prompt ?? q.question).replace(/^\s*\?\?\s*/, '').slice(0, 60))}`}
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
