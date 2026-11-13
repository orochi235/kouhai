/** Where a question was asked: enough to find the conversation again. */
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

/** A prompt the hook thought might hold a question, kept so `ask` can inherit its context. */
export type Turn = Context & { id: string; prompt: string; at: number };

/**
 * Something richer than the answer text. `artifact` is a claude.ai artifact URL, `file` a local
 * path, `url` any link, `transom` a path that was posted to the transom wall.
 */
export type Attachment = {
  kind: 'artifact' | 'file' | 'url' | 'transom';
  ref: string;
  label?: string;
};

export const ATTACHMENT_KINDS: Attachment['kind'][] = ['artifact', 'file', 'url', 'transom'];

export type Question = Context & {
  id: number;
  ref: string;
  question: string;
  answer: string | null;
  attachments: Attachment[];
  /** The whole prompt the question came from, capped, so the answer can be read in its setting. */
  prompt: string | null;
  askedAt: number;
  answeredAt: number | null;
  readAt: number | null;
  archivedAt: number | null;
  pinned: boolean;
  updatedAt: number;
};

export type Filter = 'inbox' | 'unread' | 'waiting' | 'pinned' | 'archived' | 'all';
export const FILTERS: Filter[] = ['inbox', 'unread', 'waiting', 'pinned', 'archived', 'all'];
