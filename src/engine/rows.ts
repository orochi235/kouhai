import type { RefScheme } from './refs.ts';
import { tagNames } from './tags.ts';
import type {
  Attachment,
  Basis,
  External,
  Filter,
  Item,
  Kind,
  Outcome,
  Scope,
  Via,
} from './types.ts';

export type Row = Record<string, string | number | null>;

export function toItem(r: Row, refs: RefScheme): Item {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  const kind = (r.kind === 'task' ? 'task' : 'question') as Kind;
  return {
    id: Number(r.id),
    ref: refs.refOf(kind, Number(r.id)),
    slug: s('slug'),
    kind,
    text: String(r.text),
    outcome: s('outcome') as Outcome | null,
    note: s('note'),
    verdict: s('verdict'),
    basis: s('basis') as Basis | null,
    scope: s('scope') as Scope | null,
    head: s('head'),
    cites: JSON.parse(String(r.cites ?? '[]')) as string[],
    via: s('via') as Via | null,
    usage: r.usage == null ? null : (JSON.parse(String(r.usage)) as Record<string, unknown>),
    attachments: JSON.parse(String(r.attachments ?? '[]')) as Attachment[],
    session: s('session'),
    harness: s('harness'),
    cwd: s('cwd'),
    root: s('root'),
    repo: s('repo'),
    transcript: s('transcript'),
    prompt: s('prompt'),
    raisedAt: Number(r.raised_at),
    settledAt: n('settled_at'),
    readAt: n('read_at'),
    archivedAt: n('archived_at'),
    pinned: Boolean(r.pinned),
    updatedAt: Number(r.updated_at),
    parent: s('parent'),
    misfiledAt: n('misfiled_at'),
    misfiledWhy: s('misfiled_why'),
    tags: tagNames(r.tag_names),
    external: JSON.parse(String(r.external ?? '[]')) as External[],
  };
}

export const WHERE: Record<Filter, string> = {
  inbox: 'archived_at IS NULL',
  owed: 'archived_at IS NULL AND outcome IS NULL',
  unread: 'archived_at IS NULL AND outcome IS NOT NULL AND read_at IS NULL',
  pinned: 'pinned = 1',
  archived: 'archived_at IS NOT NULL',
  all: '1 = 1',
};
