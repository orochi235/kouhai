import { execFile } from 'node:child_process';
import { runDaemon } from './daemon.ts';
import { type Payload, promptHook, stopHook } from './hooks.ts';
import { serve } from './mcp.ts';
import { port } from './paths.ts';
import { idOf, Store } from './store.ts';
import { FILTERS, type Filter, type Question } from './types.ts';

const USAGE = `dixeram: an inbox for the questions you ask Claude

  dixeram ls [${FILTERS.join('|')}]   list questions (default: unread)
  dixeram show <q-id>                print one question and its answer
  dixeram read <q-id>...             mark answers read
  dixeram open [q-id]                open the inbox page
  dixeram prune                      delete answers archived over 180 days ago

  dixeram daemon                     serve the inbox page on :${port()}
  dixeram mcp                        the MCP server Claude Code starts
  dixeram hook prompt|stop           the hooks Claude Code runs`;

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

function line(q: Question): string {
  const state = q.answer ? (q.readAt ? ' ' : '●') : '…';
  return `${state} ${q.ref.padStart(6)}  ${ago(q.answeredAt ?? q.askedAt).padStart(4)}  ${(q.repo ?? '-').padEnd(14)}  ${q.question}`;
}

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'daemon':
      return runDaemon();
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
      if (!q) throw new Error(`no question ${rest[0] ?? ''}`);
      console.log(
        `${q.ref} · ${q.repo ?? '-'} · ${q.harness ?? '-'} · asked ${ago(q.askedAt)} ago\n`,
      );
      console.log(`> ${q.question}\n`);
      console.log(q.answer ?? '(not answered yet)');
      for (const a of q.attachments)
        console.log(`\n[${a.kind}] ${a.label ? `${a.label}: ` : ''}${a.ref}`);
      return;
    }
    case 'read': {
      const store = new Store();
      for (const r of rest) if (!store.setRead(r)) console.error(`no question ${r}`);
      return;
    }
    case 'open': {
      const id = rest[0] ? idOf(rest[0]) : null;
      execFile('open', [`http://localhost:${port()}/${id ? `?q=q-${id}` : ''}`]);
      return;
    }
    case 'prune': {
      const n = new Store().prune();
      console.log(`deleted ${n.questions} archived answers and ${n.turns} stale turns`);
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
