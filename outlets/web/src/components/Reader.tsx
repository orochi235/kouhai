import { nameOf } from '@core/slug.ts';
import type { Item, Outcome, Tag } from '../api.ts';
import { repoClass } from '../repoColors.ts';
import { stamp } from '../time.ts';
import { Answer } from './Answer.tsx';
import { Enclosures } from './Enclosures.tsx';
import { Follows } from './Follows.tsx';
import { MisfileButton, MisfiledNote } from './Misfile.tsx';
import './Reader.css';
import { citation } from '../citation.ts';
import { Copy } from './Copy.tsx';
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

/** A shell that reopens the session, each step on its own line, in the harness it ran under. */
export function resumeCommand(q: Item): string {
  const env = q.harness && q.harness !== 'claude' ? `CLAUDE_CONFIG_DIR=~/.${q.harness} ` : '';
  return `${q.cwd ? `cd '${q.cwd.replace(/'/g, "'\\''")}'\n` : ''}${env}claude --resume ${q.session}`;
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
  if (!q) {
    return (
      <article className="reader blank">
        <p>Pick a letter.</p>
      </article>
    );
  }
  return (
    <article className={`reader ${q.repo ? repoClass(q.repo) : ''}`} key={q.ref}>
      <div className="toolbar">
        {q.repo && <span className={`chip project ${repoClass(q.repo)}`}>{q.repo}</span>}
        <Copy
          text={citation([q.ref])}
          label={nameOf(q)}
          className="ref"
          title={`Copy ${citation([q.ref])} to cite this item in a prompt`}
        />
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
            <p className="re">
              {q.kind === 'task'
                ? 'You told it to'
                : q.via
                  ? `You asked with /${q.via}`
                  : 'You asked'}
            </p>
            {q.outcome && <span className={`stamp ${q.outcome}`}>{STAMP[q.outcome]}</span>}
          </div>
          <h2 className="headline">{q.text}</h2>
          <dl className="postmark-block">
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
            {q.basis && (
              <div>
                <dt>basis</dt>
                <dd>{q.basis}</dd>
              </div>
            )}
            {q.scope === 'session' && (
              <div>
                <dt>scope</dt>
                <dd>this session only</dd>
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

        <Answer item={q} onSelect={onSelect} onOpenPath={onOpenPath} />

        <Enclosures item={q} onReveal={onReveal} />

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
