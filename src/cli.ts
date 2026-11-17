import { execFile } from 'node:child_process';
import { menubar } from '../outlets/menubar/outlet.ts';
import { web } from '../outlets/web/outlet.ts';
import {
  type Payload,
  promptHook,
  sessionStartHook,
  stopHook,
  subagentStopHook,
} from './capture/hooks.ts';
import { respond, serve } from './capture/mcp.ts';
import { ARCHIVE_TTL_MS, port } from './engine/paths.ts';
import { nameOf } from './engine/slug.ts';
import { idOf, Store } from './engine/store.ts';
import { FILTERS, type Filter, type Item, KINDS, type Kind } from './engine/types.ts';
import { runDaemon } from './server/server.ts';

const USAGE = `dixeram: a ledger of what Claude sessions owe you

  dixeram ls [${FILTERS.join('|')}] [questions|tasks] [--tag <tag>]
                                     list items (default: unread)
  dixeram show <id>                  print one item and how it was settled
  dixeram read <id>...               mark settled items read
  dixeram misfile <id> [why]         mark an item as filed by mistake (--undo to reverse)
  dixeram tag <id> <tag>             put one of your tags on an item (--undo to take it off)
  dixeram tags                       list your tags and how many items carry each
  dixeram open [q-id]                open the inbox page
  dixeram prune                      delete items archived over ${ARCHIVE_TTL_MS / 86_400_000} days ago

  dixeram daemon                     serve the inbox page on :${port()}
  dixeram mcp                        the MCP server Claude Code starts (a relay)
  dixeram mcp-call                   answer one MCP request from stdin, for the relay
  dixeram hook prompt|stop|subagent-stop|session-start  the hooks Claude Code runs`;

async function stdin(): Promise<Payload> {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 129600) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

function line(q: Item): string {
  const state = q.outcome ? (q.readAt ? ' ' : '●') : '…';
  return `${state} ${q.ref.padStart(6)}  ${(q.outcome ?? 'owed').padEnd(8)}  ${ago(q.settledAt ?? q.raisedAt).padStart(4)}  ${(q.repo ?? '-').padEnd(14)}  ${q.text}`;
}

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'daemon':
      return runDaemon([web, menubar]);
    case 'mcp':
      return serve();
    case 'mcp-call': {
      let line = '';
      for await (const chunk of process.stdin) line += chunk;
      const store = new Store();
      try {
        const out = respond(store, line);
        if (out) process.stdout.write(`${out}\n`);
      } finally {
        store.close();
      }
      return;
    }
    case 'hook': {
      const p = await stdin();
      const store = new Store();
      try {
        const out =
          rest[0] === 'prompt'
            ? promptHook(store, p, process.env.CLAUDE_CONFIG_DIR)
            : rest[0] === 'stop'
              ? stopHook(store, p)
              : rest[0] === 'subagent-stop'
                ? subagentStopHook(store, p)
                : rest[0] === 'session-start'
                  ? sessionStartHook(store, p)
                  : null;
        if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
      } finally {
        store.close();
      }
      return;
    }
    case 'ls': {
      const at = rest.indexOf('--tag');
      const tag = at >= 0 ? rest.splice(at, 2)[1] : undefined;
      const plural: Record<string, Kind> = { questions: 'question', tasks: 'task' };
      const kinds = rest
        .map((a) => plural[a] ?? a)
        .filter((a): a is Kind => KINDS.includes(a as Kind));
      const kind = kinds[0];
      const f = (rest.find((a) => !(a in plural) && !KINDS.includes(a as Kind)) ??
        'unread') as Filter;
      if (!FILTERS.includes(f)) throw new Error(`filter is one of ${FILTERS.join(', ')}`);
      const qs = new Store().list(f, { kind, tag });
      console.log(qs.length ? qs.map(line).join('\n') : `nothing ${f}${kind ? ` (${kind}s)` : ''}`);
      return;
    }
    case 'show': {
      const q = rest[0] ? new Store().get(rest[0]) : null;
      if (!q) throw new Error(`no item ${rest[0] ?? ''}`);
      console.log(
        `${nameOf(q)} · ${q.repo ?? '-'} · ${q.harness ?? '-'} · ${q.kind} raised ${ago(q.raisedAt)} ago · ${q.outcome ?? 'owed'}\n`,
      );
      console.log(`> ${q.text}\n`);
      console.log(q.note ?? '(still owed)');
      for (const a of q.attachments)
        console.log(`\n[${a.kind}] ${a.label ? `${a.label}: ` : ''}${a.ref}`);
      return;
    }
    case 'read': {
      const store = new Store();
      for (const r of rest) if (!store.setRead(r)) console.error(`no item ${r}`);
      return;
    }
    case 'misfile': {
      const undo = rest.includes('--undo');
      const [ref, ...why] = rest.filter((a) => a !== '--undo');
      if (!ref) return console.error('usage: dixeram misfile <id> [why]');
      const q = new Store().setMisfiled(ref, !undo, why.join(' ') || null);
      if (!q) return console.error(`no item ${ref}`);
      console.log(undo ? `${nameOf(q)} restored` : `${nameOf(q)} marked misfiled and archived`);
      return;
    }
    case 'tag': {
      const undo = rest.includes('--undo');
      const [ref, ...name] = rest.filter((a) => a !== '--undo');
      if (!ref || !name.length) return console.error('usage: dixeram tag <id> <tag> [--undo]');
      const store = new Store();
      const q = store.get(ref);
      if (!q) return console.error(`no item ${ref}`);
      store.tags.set(q.id, name.join(' '), !undo);
      console.log(`${nameOf(q)}: ${store.get(q.id)?.tags.join(', ') || 'no tags'}`);
      return;
    }
    case 'tags': {
      const tags = new Store().tags.all();
      console.log(tags.length ? tags.map((t) => `${t.name}  ${t.count}`).join('\n') : 'no tags');
      return;
    }
    case 'open': {
      const id = rest[0] ? idOf(rest[0]) : null;
      execFile('open', [`http://localhost:${port()}/${id ? `?q=q-${id}` : ''}`]);
      return;
    }
    case 'prune': {
      const n = new Store().prune();
      console.log(`deleted ${n.items} archived items and ${n.turns} stale turns`);
      return;
    }
    default:
      console.log(USAGE);
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`dixeram: ${(err as Error).message}`);
  process.exitCode = 1;
});
