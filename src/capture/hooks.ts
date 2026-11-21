import { homedir } from 'node:os';
import { join } from 'node:path';
import { contextOf } from '../engine/context.ts';
import { detect } from '../engine/detect.ts';
import type { Store } from '../engine/store.ts';
import { filedRefs, kouhaiTools, unledgeredMidTurn } from '../engine/transcript.ts';
import type { Item } from '../engine/types.ts';
import { btwRule, fileBtws, untoldBtws } from './btw.ts';
import { citations } from './cite.ts';

export type Payload = Record<string, unknown>;
export type HookOutput = Record<string, unknown> | null;

/** How long a /btw's own session has to go quiet before another session in the repo answers it. */
const BTW_ORPHAN_MS = 30 * 60 * 1000;

const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;

/** The filing rule, the same on every prompt and in the MCP server's instructions. */
export const RULE =
  'File with kouhai\'s `take`, giving each item a `slug`: every direct question the user asks (kind "question"), and every ' +
  'instruction you won\'t finish this turn (kind "task": queued, for later, or arriving mid-turn). ' +
  "Don't file an instruction you carry out or start this turn, yourself or through an agent; a " +
  'question about what to work on next; or one about how something works when answering leads into ' +
  'work this turn. A filed item stays owed until you `settle` it. Only after `take` returns ids, say ' +
  'in one line what you filed, giving each id with its slug ("Filed q-17 #cost-of-slugs, t-18 #fix-the-build.") and end an answer in chat with its id, appended to the answer\'s last paragraph ' +
  'rather than on a line of its own ("…last sentence. [q-17]"), the id a link to the item when `take` ' +
  'or `settle` gives one; if `take` fails or is not among your tools, say so instead. A kouhai call ' +
  'alone in a step costs an extra request, so pair them: file a question you answer without running ' +
  'anything already answered (`take` with `outcome` and `note`), call `take` beside your first other ' +
  "tool call, and `settle` beside your last when its note doesn't wait on that call.";

/**
 * Every prompt after a session's first. Each injection stays in context and is re-read by every
 * later call, so repeating RULE cost a session about 3% of its tokens (2026-11-14); it already sits
 * in the MCP server's instructions.
 */
export const REMINDER =
  "File its direct questions and unfinished instructions by the filing rule in kouhai's server instructions.";

/** What was settled last turn: parents a follow-up can name. */
function lastTurnRule(settled: Item[]): string {
  const list = settled.map((q) => `${q.ref} ${quote(q.text, 60)}`).join(', ');
  return (
    `Last turn you settled ${list}. If a question you file follows up on one of those ` +
    "answers, pass that item's id as the question's `parent`; leave `parent` out for a new subject."
  );
}

/** Once per session, when the tools it was given lack the one the rule names. */
function missingTake(
  store: Store,
  session: string | null,
  transcript: string | null,
): string | null {
  if (!session || !transcript) return null;
  const key = `no-take:${session}`;
  if (store.chased(key)) return null;
  const tools = kouhaiTools(transcript);
  if (!tools || (!tools.failed && tools.names.includes('take'))) return null;
  store.chaseOnce(key);
  return tools.failed
    ? "kouhai's MCP server failed to connect"
    : tools.names.length
      ? `kouhai's MCP server is out of date (it offers ${tools.names.join(', ')}, not take)`
      : "kouhai's tools were removed from this session";
}

export function promptHook(store: Store, p: Payload, configDir?: string): HookOutput {
  const prompt = typeof p.prompt === 'string' ? p.prompt : '';
  if (!prompt.trim()) return null;
  const ctx = contextOf({
    session: p.session_id,
    transcript: p.transcript_path,
    cwd: p.cwd,
    configDir,
  });
  const since = ctx.session ? store.lastTurnAt(ctx.session) : null;
  const settled = ctx.session && since != null ? store.settledSince(ctx.session, since) : [];
  const turn = store.addTurn(ctx, prompt);
  const { forced } = detect(prompt);
  const broken = missingTake(store, ctx.session, ctx.transcript);
  const cited = citations(store, prompt, ctx.session);
  const btws = ctx.session ? sideQuestions(store, ctx.session, configDir) : [];
  return {
    ...(broken
      ? { systemMessage: `kouhai ✗ ${broken}: run /mcp and reconnect kouhai` }
      : forced
        ? { systemMessage: 'kouhai ▸ marked with ??, so Claude will file this as a question' }
        : {}),
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `kouhai, turn "${turn.id}" (pass it to \`take\`). ` +
        (forced
          ? 'The user marked this prompt with `??`: it asks at least one direct question, and they want it filed and answered in a note that stands on its own, even where the filing rule would skip it (a what-to-work-on-next question, say). '
          : '') +
        (since == null ? RULE : REMINDER) +
        (broken
          ? ` Nothing can be filed this session: ${broken}. Tell the user so in one line, and that \`/mcp\` → reconnect kouhai fixes it.`
          : '') +
        (settled.length ? ` ${lastTurnRule(settled)}` : '') +
        (btws.length ? ` ${btwRule(btws)}` : '') +
        (cited ? `\n\n${cited}` : ''),
    },
  };
}

/** Files new /btw questions from this harness's history, and returns this session's not yet put to it. */
function sideQuestions(store: Store, session: string, configDir?: string): Item[] {
  fileBtws(store, configDir ?? join(homedir(), '.claude'));
  return untoldBtws(store, session);
}

/**
 * Holds the turn open once, and only for something unfiled: a message the user sent mid-turn
 * that no prompt hook delivered the filing rule for. Owed items are already in the ledger.
 */
export function stopHook(store: Store, p: Payload, configDir?: string): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  const transcript = typeof p.transcript_path === 'string' ? p.transcript_path : null;
  if (!session || !transcript) return null;
  const btws = sideQuestions(store, session, configDir);
  if (btws.length) {
    return {
      systemMessage: `kouhai ▸ holding the turn open to file ${btws.length === 1 ? 'a /btw question' : `${btws.length} /btw questions`}`,
      decision: 'block',
      reason: `kouhai: ${btwRule(btws)} If that is all, end the turn without saying so.`,
    };
  }
  const mid = unledgeredMidTurn(transcript)
    .filter((m) => !store.heard(session, m.text))
    .filter((m) => store.chaseOnce(m.key));
  if (!mid.length) return null;
  const one = mid.length === 1;
  return {
    systemMessage: `kouhai ▸ holding the turn open to check ${mid.length} mid-turn ${one ? 'message' : 'messages'}`,
    decision: 'block',
    reason: `kouhai: The user sent ${one ? 'a message' : 'messages'} while you were working that the ledger never saw: ${mid.map((m) => quote(m.text, 120)).join('; ')}. File any direct question or unfinished instruction in ${one ? 'it' : 'them'} with \`take\`. If there is nothing to file, end the turn without saying so.`,
  };
}

/**
 * A subagent gets no prompt hook and its parent never sees its tool calls, so whatever it filed
 * and left owed would sit unchased. Holds it open once to settle them or hand them up.
 */
export function subagentStopHook(store: Store, p: Payload): HookOutput {
  const transcript = typeof p.agent_transcript_path === 'string' ? p.agent_transcript_path : null;
  if (!transcript) return null;
  const owed = filedRefs(transcript)
    .map((ref) => store.get(ref))
    .filter((i): i is Item => Boolean(i && !i.outcome));
  if (!owed.length || !store.chaseOnce(`subagent:${p.agent_id ?? transcript}`)) return null;
  return {
    decision: 'block',
    reason:
      `kouhai: you filed ${owed.map((i) => `${i.ref} ${quote(i.text, 60)}`).join('; ')}, still owed. ` +
      'Settle each you have finished with `settle`. For any you have not, say in your final report ' +
      'that it is still owed, with its id, so the agent that started you carries it.',
  };
}

/** On a fresh session, what this repo's earlier sessions still owe or settled unread. */
export function sessionStartHook(store: Store, p: Payload, configDir?: string): HookOutput {
  if (p.source !== 'startup' || typeof p.cwd !== 'string') return null;
  const { repo } = contextOf({ cwd: p.cwd });
  if (!repo) return null;
  fileBtws(store, configDir ?? join(homedir(), '.claude'));
  // A /btw whose session went quiet before it could be put to it is answered by the next session here.
  const quiet = store.now() - BTW_ORPHAN_MS;
  const btws = store
    .list('owed', { repo })
    .filter(
      (i) =>
        i.via === 'btw' &&
        i.raisedAt < quiet &&
        (i.session ? (store.lastTurnAt(i.session) ?? 0) : 0) < quiet &&
        store.chaseOnce(`btw-told:${i.ref}`),
    );
  const unread = store.list('unread', { repo, limit: 6 });
  const owed = store.list('owed', { repo, limit: 6 }).filter((i) => !btws.includes(i));
  if (!unread.length && !owed.length && !btws.length) return null;
  const line = (items: Item[]) => items.map((i) => `${i.ref} ${quote(i.text, 60)}`).join('; ');
  const said = [
    ...(owed.length ? [`still owed: ${line(owed)}`] : []),
    ...(unread.length ? [`settled but unread: ${line(unread)}`] : []),
  ];
  const badge = [
    ...(owed.length ? [`${owed.length} owed`] : []),
    ...(unread.length ? [`${unread.length} unread`] : []),
  ];
  if (btws.length) badge.push(`${btws.length} /btw to answer`);
  return {
    systemMessage: `kouhai ▸ this repo has ${badge.join(', ')}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'kouhai:' +
        (said.length
          ? ` in this repo, ${said.join('. ')}. Mention these in one line at the start of your ` +
            'first reply (the ledger is `kouhai open`), then carry on. Owed items from other sessions ' +
            'are not yours unless the user hands them to you.'
          : '') +
        (btws.length
          ? ` ${btwRule(btws).replace('which you never saw', 'in an earlier session')}`
          : ''),
    },
  };
}

/** When a session ends, its answers that were of use only to it leave the inbox. */
export function sessionEndHook(store: Store, p: Payload): HookOutput {
  if (typeof p.session_id === 'string' && p.session_id) store.archiveEnded(p.session_id);
  return null;
}
