import { execFile } from 'node:child_process';
import { menubar } from '../outlets/menubar/outlet.ts';
import { web } from '../outlets/web/outlet.ts';
import { type Payload, promptHook, sessionStartHook, stopHook } from './capture/hooks.ts';
import { serve } from './capture/mcp.ts';
import { ARCHIVE_TTL_MS, port } from './engine/paths.ts';
import { idOf, Store } from './engine/store.ts';
import { FILTERS, type Filter, type Item } from './engine/types.ts';
import { runDaemon } from './server/server.ts';

const USAGE = `dixeram: a ledger of what Claude sessions owe you

  dixeram ls [${FILTERS.join('|')}]   list items (default: unread)
  dixeram show <id>                  print one item and how it was settled
  dixeram read <id>...               mark settled items read
  dixeram open [q-id]                open the inbox page
  dixeram prune                      delete items archived over ${ARCHIVE_TTL_MS / 86_400_000} days ago

  dixeram daemon                     serve the inbox page on :${port()}
  dixeram mcp                        the MCP server Claude Code starts
  dixeram hook prompt|stop|session-start  the hooks Claude Code runs`;

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
      return serve(new Store());
    case 'hook': {
      const p = await stdin();
      const store = new Store();
      try {
        const out =
          rest[0] === 'prompt'
            ? promptHook(store, p, process.env.CLAUDE_CONFIG_DIR)
            : rest[0] === 'stop'
              ? stopHook(store, p)
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
      const f = (rest[0] ?? 'unread') as Filter;
      if (!FILTERS.includes(f)) throw new Error(`filter is one of ${FILTERS.join(', ')}`);
      const qs = new Store().list(f);
      console.log(qs.length ? qs.map(line).join('\n') : `nothing ${f}`);
      return;
    }
    case 'show': {
      const q = rest[0] ? new Store().get(rest[0]) : null;
      if (!q) throw new Error(`no item ${rest[0] ?? ''}`);
      console.log(
        `${q.ref} · ${q.repo ?? '-'} · ${q.harness ?? '-'} · ${q.kind} raised ${ago(q.raisedAt)} ago · ${q.outcome ?? 'owed'}\n`,
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
