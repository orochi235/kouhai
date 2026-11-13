// A stdio MCP server with no dependencies: newline-delimited JSON-RPC, the three methods Claude Code calls.
import { createInterface } from 'node:readline';
import { contextOf } from './context.ts';
import type { Store } from './store.ts';
import { ATTACHMENT_KINDS, type Attachment, type Context } from './types.ts';

const VERSION = '0.1.0';

const INSTRUCTIONS =
  "dixeram keeps the user's direct questions and your answers in an inbox they read later, so an answer " +
  'given in the middle of other work is not lost. When the user asks you something directly, call `ask` ' +
  'before doing the work, then `answer` once you know. Still answer in chat as usual.';

const TOOLS = [
  {
    name: 'ask',
    description:
      'Record direct questions the user asked you, so the answers reach their inbox. One entry per question, ' +
      'quoted or tightly paraphrased in their words. Not for requests worded as questions ("can you fix X?"). ' +
      'Pass the `turn` id from the dixeram hook when one was given. Returns an id like q-17 for each.',
    inputSchema: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1 },
        turn: {
          type: 'string',
          description: 'The turn id from the dixeram hook, e.g. t-1a2b3c4d.',
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'answer',
    description:
      'Deliver the answer to a recorded question. Markdown. It is read away from this conversation, so lead ' +
      'with the answer and include the context needed to understand it. Answering again replaces the text, ' +
      'keeps earlier attachments, and marks it unread. Attach richer material (a claude.ai artifact URL, a ' +
      'file, a link) with `attachments`.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The question id, e.g. q-17.' },
        answer: { type: 'string' },
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
      required: ['id', 'answer'],
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

export function callTool(
  store: Store,
  fallback: Context,
  name: string,
  args: Record<string, unknown>,
): Result {
  if (name === 'ask') {
    const qs = Array.isArray(args.questions)
      ? args.questions.filter((q) => typeof q === 'string')
      : [];
    if (!qs.length) return text('`questions` needs at least one question.', true);
    const turn = typeof args.turn === 'string' ? args.turn : null;
    const recorded = store.ask(qs as string[], turn, fallback);
    return text(recorded.map((q) => `${q.ref}: ${q.question}`).join('\n'));
  }
  if (name === 'answer') {
    if (typeof args.id !== 'string' && typeof args.id !== 'number')
      return text('`id` is required.', true);
    if (typeof args.answer !== 'string' || !args.answer.trim())
      return text('`answer` is required.', true);
    const q = store.answer(args.id, args.answer, attachmentsOf(args.attachments));
    if (!q) return text(`No question ${args.id}.`, true);
    return text(`${q.ref} answered; it is in the inbox.`);
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
        return reply(text(`dixeram failed: ${(err as Error).message}`, true));
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
