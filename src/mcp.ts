// A stdio MCP server with no dependencies: newline-delimited JSON-RPC, the methods Claude Code calls.
import { createInterface } from 'node:readline';
import { contextOf } from './context.ts';
import { RULE } from './hooks.ts';
import { apiBase } from './paths.ts';
import type { Store } from './store.ts';
import {
  ATTACHMENT_KINDS,
  type Attachment,
  type Context,
  KINDS,
  type Kind,
  OUTCOMES,
  type Outcome,
} from './types.ts';

const VERSION = '0.3.0';

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
            properties: { kind: { type: 'string', enum: KINDS }, text: { type: 'string' } },
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
      'deferred. The note is markdown read away from this conversation: for an answer, lead with the ' +
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

function itemsOf(v: unknown): { kind: Kind; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((i) => {
    if (!i || typeof i !== 'object') return [];
    const { kind, text: t } = i as Record<string, unknown>;
    if (!KINDS.includes(kind as Kind) || typeof t !== 'string' || !t.trim()) return [];
    return [{ kind: kind as Kind, text: t }];
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
      `Filed in the dixeram ledger:\n${filed.map((i) => `${i.ref}: ${i.text}`).join('\n')}\n` +
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
        capabilities: { tools: {} },
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

export function serve(store: Store): void {
  // A tool call without a turn id is filed under whatever this process can see of its session.
  const fallback = contextOf({
    session: process.env.CLAUDE_CODE_SESSION_ID,
    cwd: process.cwd(),
    configDir: process.env.CLAUDE_CONFIG_DIR,
  });
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: Rpc;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const out = handle(store, fallback, msg);
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
  });
  rl.on('close', () => store.close());
}
