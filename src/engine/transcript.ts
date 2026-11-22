import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { RefScheme } from './refs.ts';

/** Enough of the transcript's end to hold the current turn. */
const TAIL_BYTES = 4 * 1024 * 1024;

export type MidTurn = { key: string; text: string };

export type Line = Record<string, unknown> & {
  type?: string;
  origin?: { kind?: string };
  message?: { content?: unknown };
  attachment?: Record<string, unknown>;
};

export function tail(path: string): Line[] {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return [];
  }
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return lines.flatMap((l) => {
      try {
        return l ? [JSON.parse(l) as Line] : [];
      } catch {
        return [];
      }
    });
  } finally {
    closeSync(fd);
  }
}

export const isPrompt = (l: Line) =>
  l.type === 'user' && l.origin?.kind === 'human' && typeof l.message?.content === 'string';

export const isMidTurn = (l: Line) =>
  l.type === 'attachment' &&
  l.attachment?.type === 'queued_command' &&
  l.attachment.commandMode === 'prompt' &&
  l.attachment.humanTurn !== false;

/** A call to kouhai's `take` or `settle`, under whatever prefix the harness gives MCP tools. */
const isLedgerCall = (l: Line) =>
  l.type === 'assistant' &&
  Array.isArray(l.message?.content) &&
  (l.message.content as { type?: string; name?: string }[]).some(
    (c) => c.type === 'tool_use' && /(?:kouhai|dixeram).*__(take|settle)$/.test(c.name ?? ''),
  );

/**
 * Messages the user sent while this turn was running, after which the agent never touched the
 * ledger. They reach the agent without a prompt hook, so they are where instructions get lost.
 */
export function unledgeredMidTurn(path: string): MidTurn[] {
  const lines = tail(path);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isPrompt(lines[i] as Line)) {
      start = i;
      break;
    }
  }
  const out: MidTurn[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i] as Line;
    if (isMidTurn(l)) {
      const a = l.attachment as Record<string, unknown>;
      out.push({
        key: String(a.source_uuid ?? l.uuid ?? i),
        text: String(a.prompt ?? ''),
      });
    } else if (isLedgerCall(l)) {
      out.length = 0;
    }
  }
  return out;
}

/**
 * The kouhai tools this session was given, from the transcript's tool-list records: null when
 * the transcript says nothing about them (no tool search, or not yet connected), and `failed`
 * when the server failed to connect.
 */
export function kouhaiTools(path: string): { names: string[]; failed: boolean } | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const names = new Set<string>();
  let seen = false;
  let failed = false;
  const ours = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((n): n is string => typeof n === 'string' && /(?:kouhai|dixeram)__/.test(n))
      : [];
  for (const l of raw.split('\n')) {
    if (!l.includes('"deferred_tools_delta"')) continue;
    let a: Record<string, unknown> | undefined;
    try {
      a = (JSON.parse(l) as Line).attachment;
    } catch {
      continue;
    }
    if (a?.type !== 'deferred_tools_delta') continue;
    for (const n of ours(a.addedNames)) {
      names.add(n);
      seen = true;
    }
    for (const n of ours(a.removedNames)) {
      names.delete(n);
      seen = true;
    }
    const down =
      Array.isArray(a.failedMcpServers) &&
      a.failedMcpServers.some((x) => /kouhai|dixeram/.test(JSON.stringify(x)));
    if (down) seen = true;
    failed = down;
  }
  if (!seen) return null;
  return { names: [...names].map((n) => n.replace(/^.*__/, '')), failed };
}

/** The refs `take` returned anywhere in a transcript, read from its tool results. */
export function filedRefs(path: string, refs = new RefScheme()): string[] {
  const line = new RegExp(`^${refs.source}(?![\\w-])`, 'gim');
  const found = new Set<string>();
  for (const l of tail(path)) {
    const content = l.type === 'user' ? l.message?.content : null;
    if (!Array.isArray(content)) continue;
    for (const c of content as { type?: string; content?: unknown }[]) {
      if (c.type !== 'tool_result') continue;
      const body =
        typeof c.content === 'string'
          ? c.content
          : Array.isArray(c.content)
            ? (c.content as { text?: unknown }[]).map((t) => String(t.text ?? '')).join('\n')
            : '';
      if (!/^Filed in the (?:kouhai|dixeram) ledger:/.test(body)) continue;
      for (const m of body.matchAll(line)) found.add(m[1] as string);
    }
  }
  return [...found];
}
