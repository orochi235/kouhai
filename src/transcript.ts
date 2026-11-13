import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/** Enough of the transcript's end to hold the current turn. */
const TAIL_BYTES = 4 * 1024 * 1024;

export type MidTurn = { key: string; text: string };

type Line = Record<string, unknown> & {
  type?: string;
  origin?: { kind?: string };
  message?: { content?: unknown };
  attachment?: Record<string, unknown>;
};

function tail(path: string): Line[] {
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

const isPrompt = (l: Line) =>
  l.type === 'user' && l.origin?.kind === 'human' && typeof l.message?.content === 'string';

const isMidTurn = (l: Line) =>
  l.type === 'attachment' &&
  l.attachment?.type === 'queued_command' &&
  l.attachment.commandMode === 'prompt' &&
  l.attachment.humanTurn !== false;

/** A call to dixeram's `take` or `settle`, under whatever prefix the harness gives MCP tools. */
const isLedgerCall = (l: Line) =>
  l.type === 'assistant' &&
  Array.isArray(l.message?.content) &&
  (l.message.content as { type?: string; name?: string }[]).some(
    (c) => c.type === 'tool_use' && /dixeram.*__(take|settle)$/.test(c.name ?? ''),
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
