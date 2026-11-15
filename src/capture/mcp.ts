// A stdio MCP server with no dependencies: newline-delimited JSON-RPC, the methods Claude Code calls.
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { contextOf } from '../engine/context.ts';
import { apiBase } from '../engine/paths.ts';
import type { Store } from '../engine/store.ts';
import {
  ATTACHMENT_KINDS,
  type Attachment,
  type Context,
  KINDS,
  type Kind,
  OUTCOMES,
  type Outcome,
} from '../engine/types.ts';
import { RULE } from './hooks.ts';

const VERSION = '0.4.0';

const INSTRUCTIONS =
  "dixeram is a ledger of what you owe the user: their direct questions, and instructions you haven't " +
  'carried out yet. They read it later, so nothing asked mid-task gets lost. Answer in chat as usual too. ' +
  RULE;

const ALL_OUTCOMES = [...new Set(Object.values(OUTCOMES).flat())];

const TOOLS = [
  {
    name: 'take',
    description:
      'File items you now owe the user. A "question" is anything they asked you directly. A "task" is ' +
      'an instruction you will not finish before this turn ends; one you carry out now needs no filing. ' +
      'Quote or tightly paraphrase their words. Pass the `turn` id from the dixeram hook when one was ' +
      'given. Returns ids like q-17 and t-18.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: KINDS },
              text: { type: 'string' },
              parent: {
                type: 'string',
                description:
                  'For a follow-up question: the id of the settled item whose answer it responds to, e.g. q-17.',
              },
            },
            required: ['kind', 'text'],
          },
        },
        turn: { type: 'string', description: 'The turn id from the dixeram hook.' },
      },
      required: ['items'],
    },
  },
  {
    name: 'settle',
    description:
      'Settle an item. A question settles as answered, a task as done; either can be dropped or ' +
      'deferred (moved to another durable home: a TODO entry, an issue; say where). Work still waiting on a later turn is not deferred: leave it owed. The note is markdown, linked generously (files as markdown links to absolute paths; commits, PRs, issues, docs, and artifacts by URL), read away from this conversation: for an answer, lead with the ' +
      'answer and give the context needed; for a task, what was done (commits, files); for dropped or ' +
      'deferred, why, and where it went. Settling again replaces the note, keeps attachments, and marks ' +
      'it unread. Attach richer material (a claude.ai artifact URL, a file, a link) with `attachments`.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item id, e.g. q-17 or t-18.' },
        outcome: { type: 'string', enum: ALL_OUTCOMES },
        note: { type: 'string' },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ATTACHMENT_KINDS },
              ref: { type: 'string', description: 'URL or absolute path.' },
              label: { type: 'string' },
            },
            required: ['kind', 'ref'],
          },
        },
      },
      required: ['id', 'outcome', 'note'],
    },
  },
  {
    name: 'clear',
    description:
      'Take an answered question out of the inbox because the user has already seen it, only as the ' +
      'dixeram hook describes: the next prompt responds to the answer, and the answer will not ' +
      'outlive this session.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The item id, e.g. q-17.' } },
      required: ['id'],
    },
  },
  {
    name: 'owed',
    description:
      'List what this session still owes the user. Use it after a long stretch of work or a ' +
      'compaction, before telling the user you are finished.',
    inputSchema: {
      type: 'object',
      properties: { turn: { type: 'string', description: 'Any turn id from this session.' } },
    },
  },
];

type Rpc = {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (t: string, isError = false): Result => ({
  content: [{ type: 'text', text: t }],
  ...(isError ? { isError } : {}),
});

function attachmentsOf(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const { kind, ref, label } = a as Record<string, unknown>;
    if (!ATTACHMENT_KINDS.includes(kind as Attachment['kind']) || typeof ref !== 'string' || !ref)
      return [];
    return [{ kind, ref, ...(typeof label === 'string' && label ? { label } : {}) } as Attachment];
  });
}

function itemsOf(v: unknown): { kind: Kind; text: string; parent: string | null }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((i) => {
    if (!i || typeof i !== 'object') return [];
    const { kind, text: t, parent } = i as Record<string, unknown>;
    if (!KINDS.includes(kind as Kind) || typeof t !== 'string' || !t.trim()) return [];
    return [
      { kind: kind as Kind, text: t, parent: typeof parent === 'string' && parent ? parent : null },
    ];
  });
}

export function callTool(
  store: Store,
  fallback: Context,
  name: string,
  args: Record<string, unknown>,
): Result {
  const link = (ref: string) => `${apiBase().replace('127.0.0.1', 'localhost')}/?q=${ref}`;
  if (name === 'take') {
    const items = itemsOf(args.items);
    if (!items.length) return text('`items` needs at least one {kind, text}.', true);
    const turn = typeof args.turn === 'string' ? args.turn : null;
    const filed = store.take(items, turn, fallback);
    return text(
      `Filed in the dixeram ledger:\n${filed.map((i) => `${i.ref}${i.parent ? ` (follows ${i.parent})` : ''}: ${i.text}`).join('\n')}\n` +
        'Tell the user in one line what you filed, then `settle` each when it is.',
    );
  }
  if (name === 'settle') {
    if (typeof args.id !== 'string' && typeof args.id !== 'number')
      return text('`id` is required.', true);
    if (!ALL_OUTCOMES.includes(args.outcome as Outcome))
      return text(`\`outcome\` is one of ${ALL_OUTCOMES.join(', ')}.`, true);
    if (typeof args.note !== 'string' || !args.note.trim())
      return text('`note` is required.', true);
    const item = store.settle(
      args.id,
      args.outcome as Outcome,
      args.note,
      attachmentsOf(args.attachments),
    );
    if (!item) return text(`No item ${args.id}.`, true);
    return text(
      `${item.ref} settled as ${item.outcome} (${link(item.ref)})` +
        (item.attachments.length ? ` with ${item.attachments.length} enclosed` : '') +
        (item.kind === 'question' ? '. End your answer in chat with its id.' : '.'),
    );
  }
  if (name === 'clear') {
    if (typeof args.id !== 'string' && typeof args.id !== 'number')
      return text('`id` is required.', true);
    const item = store.get(args.id);
    if (!item) return text(`No item ${args.id}.`, true);
    if (!item.outcome) return text(`${item.ref} is still owed; settle it first.`, true);
    store.clear(item.id);
    return text(`${item.ref} cleared from the inbox as seen.`);
  }
  if (name === 'owed') {
    const turn = typeof args.turn === 'string' ? store.turn(args.turn) : null;
    const session = turn?.session ?? fallback.session;
    if (!session) return text('No session to look up; pass a turn id.', true);
    const owed = store.list('owed', { session });
    return text(
      owed.length
        ? `Still owed:\n${owed.map((i) => `${i.ref} (${i.kind}): ${i.text}`).join('\n')}`
        : 'Nothing owed in this session.',
    );
  }
  return text(`Unknown tool ${name}.`, true);
}

export function handle(store: Store, fallback: Context, msg: Rpc): object | null {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'dixeram', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return reply(callTool(store, fallback, name, args));
      } catch (err) {
        return reply(text(`dixeram: ${(err as Error).message}`, true));
      }
    }
    default:
      if (msg.id === undefined) return null;
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `no method ${msg.method}` },
      };
  }
}

/** One JSON-RPC line in, its reply out (null for a notification), against the code on disk now. */
export function respond(store: Store, line: string): string | null {
  let msg: Rpc;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  // A tool call without a turn id is filed under whatever this process can see of its session.
  const fallback = contextOf({
    session: process.env.CLAUDE_CODE_SESSION_ID,
    cwd: process.cwd(),
    configDir: process.env.CLAUDE_CONFIG_DIR,
  });
  const out = handle(store, fallback, msg);
  return out ? JSON.stringify(out) : null;
}

/** A child that dies or stalls would otherwise leave Claude Code waiting 30 minutes for a reply. */
export const CALL_TIMEOUT_MS = 15_000;

type Ran = { stdout?: string | null; stderr?: string | null; status: number | null; error?: Error };

/** What the relay sends back for a request: the child's reply, or an error saying why there is none. */
export function relayReply(msg: Rpc, ran: Ran): string {
  const out = ran.stdout?.trim() ?? '';
  if (out) return out;
  const why = ran.error
    ? ran.error.message
    : `mcp-call exited ${ran.status ?? 'on a signal'}${ran.stderr?.trim() ? `: ${ran.stderr.trim().split('\n').slice(-3).join(' ')}` : ' with no reply'}`;
  const message = `dixeram: ${why}`;
  return JSON.stringify(
    msg.method === 'tools/call'
      ? { jsonrpc: '2.0', id: msg.id, result: text(message, true) }
      : { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message } },
  );
}

/**
 * The long-lived server is only a relay: each request runs in a fresh `dixeram mcp-call`, so a
 * session started before a change still gets current code, and is told when the tools change.
 */
export function serve(): void {
  const relay = (line: string, msg: Rpc) =>
    relayReply(
      msg,
      spawnSync(process.execPath, [...process.execArgv, process.argv[1] ?? '', 'mcp-call'], {
        input: line,
        encoding: 'utf8',
        timeout: CALL_TIMEOUT_MS,
      }),
    );
  const toolsOf = (reply: string) => {
    try {
      return JSON.stringify(JSON.parse(reply).result?.tools ?? null);
    } catch {
      return null;
    }
  };
  let listed: string | null = null;
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    let msg: Rpc;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    const reply = relay(line, msg);
    process.stdout.write(`${reply}\n`);
    if (msg.method === 'tools/list') listed = toolsOf(reply);
    if (msg.method === 'tools/call' && listed !== null) {
      const list: Rpc = { jsonrpc: '2.0', id: 0, method: 'tools/list' };
      const now = toolsOf(relay(JSON.stringify(list), list));
      if (now !== null && now !== listed) {
        listed = now;
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n`,
        );
      }
    }
  });
}
