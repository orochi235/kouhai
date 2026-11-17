/** Where an item was raised: enough to find the conversation again. */
export type Context = {
  session: string | null;
  /** The Claude config directory's name without its dot: `claude`, `claude-msb`, `claude-pw`. */
  harness: string | null;
  cwd: string | null;
  /** The git root of `cwd`, or `cwd` itself outside a repo. */
  root: string | null;
  repo: string | null;
  transcript: string | null;
};

/** A prompt, kept so `take` can file items under its context. */
export type Turn = Context & { id: string; prompt: string; at: number };

/**
 * Something richer than the note. `artifact` is a claude.ai artifact URL, `file` a local path,
 * `url` any link, `transom` a path that was posted to the transom wall. Anything pointing into
 * transom is copied into the ledger when attached, since the wall deletes what it holds.
 */
export type Attachment = {
  kind: 'artifact' | 'file' | 'url' | 'transom';
  ref: string;
  label?: string;
};

export const ATTACHMENT_KINDS: Attachment['kind'][] = ['artifact', 'file', 'url', 'transom'];

/** A direct question the user asked, or an instruction the agent has not carried out yet. */
export type Kind = 'question' | 'task';
export const KINDS: Kind[] = ['question', 'task'];

export type Outcome = 'answered' | 'done' | 'dropped' | 'deferred';
export const OUTCOMES: Record<Kind, Outcome[]> = {
  question: ['answered', 'dropped', 'deferred'],
  task: ['done', 'dropped', 'deferred'],
};

export type Item = Context & {
  id: number;
  /** `q-17` for a question, `t-17` for a task; the number alone identifies it. */
  ref: string;
  /** A few words naming it, cited as `#cost-of-slugs`; null for items filed without one. */
  slug: string | null;
  kind: Kind;
  text: string;
  /** Null while the item is owed. */
  outcome: Outcome | null;
  /** The answer, what was done, or why it was dropped or deferred. Markdown. */
  note: string | null;
  attachments: Attachment[];
  /** The whole prompt the item came from, capped, so it can be read in its setting. */
  prompt: string | null;
  raisedAt: number;
  settledAt: number | null;
  readAt: number | null;
  archivedAt: number | null;
  pinned: boolean;
  updatedAt: number;
  /** The settled item this one follows up on, as its ref; null for one that stands alone. */
  parent: string | null;
  /** When the user marked it as something that should never have been filed. */
  misfiledAt: number | null;
  /** Their reason, if they gave one. */
  misfiledWhy: string | null /** The user's tags on it, by name. */;
  tags: string[];
};

/** A label the user defined; `count` is how many unarchived items carry it. */
export type Tag = { id: number; name: string; color: string; count: number };

export type Filter = 'inbox' | 'owed' | 'unread' | 'pinned' | 'archived' | 'all';
export const FILTERS: Filter[] = ['inbox', 'owed', 'unread', 'pinned', 'archived', 'all'];
