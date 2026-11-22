// The Stop and SubagentStop hooks' other job: counting what the turn cost, from its transcript.
import { lastPrompt, linesFrom, meter, tokensOf } from '../engine/meter.ts';
import type { Store } from '../engine/store.ts';
import type { HookOutput, Payload } from './hooks.ts';
import { fixedChars } from './mcp.ts';

/**
 * Counts what the transcript added since the last count and adds it to the session's latest
 * turn. A session first met mid-way is counted from its last prompt, after replaying the rest
 * only to learn what kouhai already has in context.
 */
function count(store: Store, key: string, path: string, session: string, agent: boolean) {
  const was = store.costs.meterOf(key);
  const { lines, end } = linesFrom(path, was?.offset ?? 0);
  if (!lines.length) return;
  const from = was || agent ? 0 : lastPrompt(lines);
  const { spend, live } = meter(lines, tokensOf(fixedChars(store)), was?.live ?? 0, from);
  store.costs.record(key, session, spend, { offset: end, live }, agent);
}

export function spendHook(store: Store, p: Payload): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  const path = typeof p.transcript_path === 'string' ? p.transcript_path : null;
  if (session && path) count(store, `session:${session}`, path, session, false);
  return null;
}

/** A subagent's calls are not in its parent's transcript, so its own is counted into the parent's turn. */
export function subagentSpendHook(store: Store, p: Payload): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  const path = typeof p.agent_transcript_path === 'string' ? p.agent_transcript_path : null;
  if (session && path) count(store, `agent:${p.agent_id ?? path}`, path, session, true);
  return null;
}
