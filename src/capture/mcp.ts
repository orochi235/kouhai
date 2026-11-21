// A stdio MCP server with no dependencies: newline-delimited JSON-RPC, the methods Claude Code calls.
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { contextOf } from '../engine/context.ts';
import { apiBase } from '../engine/paths.ts';
import { nameOf } from '../engine/slug.ts';
import type { Store } from '../engine/store.ts';
import {
  ATTACHMENT_KINDS,
  type Attachment,
  BASES,
  type Basis,
  type Context,
  KINDS,
  type Kind,
  type Outcome,
  SCOPES,
  type Scope,
  type Settlement,
} from '../engine/types.ts';
import { itemText, markShown } from './cite.ts';
import { RULE } from './hooks.ts';
import { ALL_OUTCOMES, TOOLS } from './tools.ts';

const VERSION = '0.4.0';

const INSTRUCTIONS =
  'kouhai is the ledger of what you owe the user, read later away from this chat; answer in chat ' +
  `as usual too. ${RULE}`;

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** The instructions, plus what the user marked as filed by mistake, so sessions learn from it. */
export function instructions(store: Store): string {
  const misfiled = store.misfiles(5);
  if (!misfiled.length) return INSTRUCTIONS;
  const list = misfiled
    .map((i) => `"${clip(i.text, 60)}"${i.misfiledWhy ? ` (${clip(i.misfiledWhy, 80)})` : ''}`)
    .join('; ');
  return `${INSTRUCTIONS} The user marked these filed by mistake; don't file their like: ${list}.`;
}

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

type Taken = {
  kind: Kind;
  text: string;
  parent: string | null;
  slug: string | null;
  settled: Settled | null;
};
type Settled = { outcome: Outcome; note: string; attachments: Attachment[]; extra: Settlement };

/** The verdict, basis, and scope an agent passed, keeping only values of the right shape. */
function settlementOf(v: Record<string, unknown>): Settlement {
  return {
    verdict: typeof v.verdict === 'string' && v.verdict.trim() ? v.verdict.trim() : null,
    basis: BASES.includes(v.basis as Basis) ? (v.basis as Basis) : null,
    scope: SCOPES.includes(v.scope as Scope) ? (v.scope as Scope) : null,
  };
}

function itemsOf(v: unknown): Taken[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((i) => {
    if (!i || typeof i !== 'object') return [];
    const fields = i as Record<string, unknown>;
    const { kind, text: t, parent, slug, outcome, note, attachments } = fields;
    if (!KINDS.includes(kind as Kind) || typeof t !== 'string' || !t.trim()) return [];
    const settled =
      ALL_OUTCOMES.includes(outcome as Outcome) && typeof note === 'string' && note.trim()
        ? {
            outcome: outcome as Outcome,
            note,
            attachments: attachmentsOf(attachments),
            extra: settlementOf(fields),
          }
        : null;
    return [
      {
        kind: kind as Kind,
        text: t,
        parent: typeof parent === 'string' && parent ? parent : null,
        slug: typeof slug === 'string' && slug ? slug : null,
        settled,
      },
    ];
  });
}

let uiSeen: { up: boolean; at: number } | null = null;
/** Whether the ledger's web UI answers, so a marker can link to it; checked at most every 30 s. */
function uiUp(): boolean {
  if (uiSeen && Date.now() - uiSeen.at < 30_000) return uiSeen.up;
  const r = spawnSync('curl', [
    '-s',
    '-o',
    '/dev/null',
    '-m',
    '0.3',
    '-w',
    '%{http_code}',
    `${apiBase()}/`,
  ]);
  uiSeen = { up: r.status === 0 && String(r.stdout).startsWith('2'), at: Date.now() };
  return uiSeen.up;
}

/** How to end a chat answer with an item's marker: a link to the item while the UI runs, else the bare id. */
function markerRule(refs: readonly string[], link: (ref: string) => string): string {
  const shown = uiUp() ? refs.map((r) => `[${r}](${link(r)})`).join(', ') : refs.join(', ');
  return `end an answer in chat with "[${shown}]", appended to its last paragraph rather than on a line of its own`;
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
    // Filed first, so an outcome that doesn't fit its kind still leaves the item owed, not lost.
    const lines = filed.map((i, n) => {
      const head = `${nameOf(i)}${i.parent ? ` (follows ${i.parent})` : ''}: ${i.text}`;
      const s = items[n]?.settled;
      if (!s) return { head, owed: true, question: false };
      try {
        store.settle(i.id, s.outcome, s.note, s.attachments, s.extra);
        return {
          head: `${head} [settled as ${s.outcome}: ${link(i.ref)}]`,
          owed: false,
          question: i.kind === 'question',
        };
      } catch (err) {
        return {
          head: `${head} [not settled: ${(err as Error).message}]`,
          owed: true,
          question: false,
        };
      }
    });
    return text(
      `Filed in the kouhai ledger:\n${lines.map((l) => l.head).join('\n')}\n` +
        'Tell the user in one line what you filed, naming each by id and slug as above' +
        (lines.some((l) => l.owed) ? ', then `settle` each still owed when it is' : '') +
        (lines.some((l) => l.question)
          ? `; ${markerRule(
              filed.filter((i) => i.kind === 'question').map((i) => i.ref),
              link,
            )}`
          : '') +
        '.',
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
      settlementOf(args),
    );
    if (!item) return text(`No item ${args.id}.`, true);
    return text(
      `${item.ref} settled as ${item.outcome} (${link(item.ref)})` +
        (item.attachments.length ? ` with ${item.attachments.length} enclosed` : '') +
        (item.kind === 'question' ? `. ${markerRule([item.ref], link).replace(/^e/, 'E')}.` : '.'),
    );
  }
  if (name === 'show') {
    const ids = Array.isArray(args.ids) ? args.ids : [args.ids];
    const items = ids.flatMap((id) => (id == null ? [] : (store.get(String(id)) ?? [])));
    if (!items.length) return text(`No item ${ids.join(', ')}.`, true);
    for (const q of items) markShown(store, fallback.session, q);
    return text(items.map((q) => itemText(q)).join('\n\n'));
  }
  if (name === 'owed') {
    const turn = typeof args.turn === 'string' ? store.turn(args.turn) : null;
    const session = turn?.session ?? fallback.session;
    if (!session) return text('No session to look up; pass a turn id.', true);
    const owed = store.list('owed', { session });
    return text(
      owed.length
        ? `Still owed:\n${owed.map((i) => `${nameOf(i)} (${i.kind}): ${i.text}`).join('\n')}`
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
        serverInfo: { name: 'kouhai', version: VERSION },
        instructions: instructions(store),
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
        return reply(text(`kouhai: ${(err as Error).message}`, true));
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
  const message = `kouhai: ${why}`;
  return JSON.stringify(
    msg.method === 'tools/call'
      ? { jsonrpc: '2.0', id: msg.id, result: text(message, true) }
      : { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message } },
  );
}

/**
 * The long-lived server is only a relay: each request runs in a fresh `kouhai mcp-call`, so a
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
