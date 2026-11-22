// The daemon's tidy pass over answered questions: one small-model call per harness for a batch,
// run through `claude -p` on that harness's own login so work stays on the work account.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../engine/store.ts';
import {
  applyTriage,
  skipTriage,
  type Triage,
  type Untriaged,
  untriaged,
} from '../engine/triage.ts';

/** Questions older than this when the daemon first sees them are left as they are. */
const LOOKBACK_MS = 6 * 60 * 60 * 1000;
const NOTE_CHARS = 1500;

/** Runs one prompt on a harness's login; resolves to Claude's reply and what it cost. */
export type Ask = (
  harness: string | null,
  system: string,
  prompt: string,
) => Promise<{ text: string; usage: unknown }>;

export function systemFor(misfiled: string[]): string {
  return (
    'You tidy a ledger of questions a user asked a coding agent. For each item you get the ' +
    "user's message and the agent's answer. Reply with only a JSON array, one object per item: " +
    '{"id": number, "question": string, "verdict": string, "keep": boolean}. ' +
    "`question` is the one question the answer answers, quoted from the user's message, or " +
    'tightly paraphrased where a quote would not stand alone; under 200 characters. ' +
    '`verdict` is the answer in one sentence. `keep` is true when the answer is worth finding ' +
    'again away from this conversation: a fact about a system, a decision, an explanation, a ' +
    'number. It is false for a conversational question: a reaction or complaint phrased as a ' +
    'question, a check on what just happened, a clarification of the answer just given, a ' +
    'rhetorical question, or an instruction phrased as a question.' +
    (misfiled.length
      ? ` The user marked these as not worth filing at all, so they are not keepers: ${misfiled.join('; ')}.`
      : '')
  );
}

export function promptFor(items: Untriaged[]): string {
  return JSON.stringify(
    items.map((i) => ({ id: i.id, message: i.asked, answer: i.note.slice(0, NOTE_CHARS) })),
  );
}

/** The decisions in a reply, keeping only well-formed ones for the items asked about. */
export function triagesIn(reply: string, ids: Set<number>): Triage[] {
  const at = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (at < 0 || end < at) return [];
  let list: unknown;
  try {
    list = JSON.parse(reply.slice(at, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((t) => {
    const r = t as Record<string, unknown>;
    if (typeof r.id !== 'number' || !ids.has(r.id) || typeof r.keep !== 'boolean') return [];
    const s = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined;
    return [{ id: r.id, question: s(r.question), verdict: s(r.verdict), keep: r.keep }];
  });
}

/** One pass: each harness's untriaged questions in one call. Whatever fails is marked seen. */
export async function triage(store: Store, ask: Ask): Promise<void> {
  const items = untriaged(store.db, store.now() - LOOKBACK_MS);
  if (!items.length) return;
  const misfiled = store.misfiles(5).map((i) => JSON.stringify(i.text.slice(0, 80)));
  const byHarness = new Map<string | null, Untriaged[]>();
  for (const i of items) byHarness.set(i.harness, [...(byHarness.get(i.harness) ?? []), i]);
  for (const [harness, batch] of byHarness) {
    const ids = new Set(batch.map((i) => i.id));
    try {
      const { text, usage } = await ask(harness, systemFor(misfiled), promptFor(batch));
      const found = triagesIn(text, ids);
      for (const t of found) applyTriage(store.db, store.now(), t);
      skipTriage(
        store.db,
        store.now(),
        [...ids].filter((id) => !found.some((t) => t.id === id)),
      );
      console.log(
        `triaged ${found.length}/${batch.length} questions on ${harness ?? 'default'}: ${JSON.stringify(usage)}`,
      );
    } catch (err) {
      skipTriage(store.db, store.now(), [...ids]);
      console.error(`triage on ${harness ?? 'default'}: ${(err as Error).message}`);
    }
  }
}

/** Asks through `claude -p` on Haiku, with no tools, settings, plugins, or MCP servers. */
export const askClaude: Ask = (harness, system, prompt) =>
  new Promise((resolve, reject) => {
    const local = join(homedir(), '.local', 'bin', 'claude');
    const env = { ...process.env };
    if (harness) env.CLAUDE_CONFIG_DIR = join(homedir(), `.${harness}`);
    execFile(
      existsSync(local) ? local : 'claude',
      [
        '-p',
        '--model',
        'haiku',
        '--system-prompt',
        system,
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--disable-slash-commands',
        '--output-format',
        'json',
        prompt,
      ],
      { cwd: tmpdir(), env, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const out = JSON.parse(String(stdout)) as {
            result?: string;
            usage?: unknown;
            total_cost_usd?: unknown;
          };
          resolve({
            text: String(out.result ?? ''),
            usage: { ...(out.usage as object), cost: out.total_cost_usd },
          });
        } catch (e) {
          reject(e as Error);
        }
      },
    );
  });
