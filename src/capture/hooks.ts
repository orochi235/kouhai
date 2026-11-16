import { contextOf } from '../engine/context.ts';
import { detect } from '../engine/detect.ts';
import type { Store } from '../engine/store.ts';
import { dixeramTools, filedRefs, unledgeredMidTurn } from '../engine/transcript.ts';
import type { Item } from '../engine/types.ts';

export type Payload = Record<string, unknown>;
export type HookOutput = Record<string, unknown> | null;

const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;

/** The filing rule, the same on every prompt and in the MCP server's instructions. */
export const RULE =
  'File with dixeram\'s `take`: every direct question the user asks (kind "question"), and every ' +
  'instruction you won\'t finish this turn (kind "task": queued, for later, or arriving mid-turn). ' +
  "Don't file an instruction you carry out or start this turn, yourself or through an agent; a " +
  'question about what to work on next; or one about how something works when answering leads into ' +
  'work this turn. A filed item stays owed until you `settle` it. Only after `take` returns ids, say ' +
  'in one line what you filed ("Filed q-17, t-18.") and end an answer in chat with its id ' +
  '("(q-17 → inbox)"); if `take` fails or is not among your tools, say so instead. A dixeram call ' +
  'alone in a step costs an extra request, so pair them: file a question you answer without running ' +
  'anything already answered (`take` with `outcome` and `note`), call `take` beside your first other ' +
  "tool call, and `settle` beside your last when its note doesn't wait on that call.";

/**
 * Every prompt after a session's first. Each injection stays in context and is re-read by every
 * later call, so repeating RULE cost a session about 3% of its tokens (2026-11-14); it already sits
 * in the MCP server's instructions.
 */
export const REMINDER =
  "File its direct questions and unfinished instructions by the filing rule in dixeram's server instructions.";

/** What was settled last turn: parents a follow-up can name, and answers this prompt may show were read. */
function lastTurnRule(settled: Item[]): string {
  const list = (items: Item[]) => items.map((q) => `${q.ref} ${quote(q.text, 60)}`).join(', ');
  const unread = settled.filter(
    (q) => q.kind === 'question' && q.outcome === 'answered' && !q.readAt && !q.archivedAt,
  );
  return (
    `Last turn you settled ${list(settled)}. If a question you file follows up on one of those ` +
    "answers, pass that item's id as the question's `parent`; leave `parent` out for a new subject." +
    (unread.length ? ` ${seenRule(unread)}` : '')
  );
}

/** Last turn's unread answers, which this prompt may show were already read. */
function seenRule(answered: Item[]): string {
  return (
    `Clear one of ${answered.map((q) => q.ref).join(', ')} with the dixeram \`clear\` tool only when both hold: this prompt responds to that ` +
    'answer, so the user has seen it; and the answer is about something that will not outlive this ' +
    'session, such as a label on a page made for this task. Otherwise leave it in the inbox: an ' +
    'answer that lasts, or one the user moved on from, is what the inbox is for.'
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
  const tools = dixeramTools(transcript);
  if (!tools || (!tools.failed && tools.names.includes('take'))) return null;
  store.chaseOnce(key);
  return tools.failed
    ? "dixeram's MCP server failed to connect"
    : tools.names.length
      ? `dixeram's MCP server is out of date (it offers ${tools.names.join(', ')}, not take)`
      : "dixeram's tools were removed from this session";
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
  const { forced, candidate } = detect(prompt);
  const broken = missingTake(store, ctx.session, ctx.transcript);
  return {
    ...(broken
      ? { systemMessage: `dixeram ✗ ${broken}: run /mcp and reconnect dixeram` }
      : candidate
        ? {
            systemMessage: forced
              ? 'dixeram ▸ marked with ??, so Claude will file this as a question'
              : 'dixeram ▸ this prompt might hold a question; Claude will file it if so',
          }
        : {}),
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `dixeram, turn "${turn.id}" (pass it to \`take\`). ` +
        (forced
          ? 'The user marked this prompt with `??`: it asks at least one direct question, and they want it filed and answered in a note that stands on its own, even where the filing rule would skip it (a what-to-work-on-next question, say). '
          : '') +
        (since == null ? RULE : REMINDER) +
        (broken
          ? ` Nothing can be filed this session: ${broken}. Tell the user so in one line, and that \`/mcp\` → reconnect dixeram fixes it.`
          : '') +
        (settled.length ? ` ${lastTurnRule(settled)}` : ''),
    },
  };
}

/**
 * Holds the turn open once, and only for something unfiled: a message the user sent mid-turn
 * that no prompt hook delivered the filing rule for. Owed items are already in the ledger.
 */
export function stopHook(store: Store, p: Payload): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  const transcript = typeof p.transcript_path === 'string' ? p.transcript_path : null;
  if (!session || !transcript) return null;
  const mid = unledgeredMidTurn(transcript)
    .filter((m) => !store.heard(session, m.text))
    .filter((m) => store.chaseOnce(m.key));
  if (!mid.length) return null;
  const one = mid.length === 1;
  return {
    systemMessage: `dixeram ▸ holding the turn open to check ${mid.length} mid-turn ${one ? 'message' : 'messages'}`,
    decision: 'block',
    reason: `dixeram: The user sent ${one ? 'a message' : 'messages'} while you were working that the ledger never saw: ${mid.map((m) => quote(m.text, 120)).join('; ')}. File any direct question or unfinished instruction in ${one ? 'it' : 'them'} with \`take\`. If there is nothing to file, end the turn without saying so.`,
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
      `dixeram: you filed ${owed.map((i) => `${i.ref} ${quote(i.text, 60)}`).join('; ')}, still owed. ` +
      'Settle each you have finished with `settle`. For any you have not, say in your final report ' +
      'that it is still owed, with its id, so the agent that started you carries it.',
  };
}

/** On a fresh session, what this repo's earlier sessions still owe or settled unread. */
export function sessionStartHook(store: Store, p: Payload): HookOutput {
  if (p.source !== 'startup' || typeof p.cwd !== 'string') return null;
  const { repo } = contextOf({ cwd: p.cwd });
  if (!repo) return null;
  const unread = store.list('unread', { repo, limit: 6 });
  const owed = store.list('owed', { repo, limit: 6 });
  if (!unread.length && !owed.length) return null;
  const line = (items: Item[]) => items.map((i) => `${i.ref} ${quote(i.text, 60)}`).join('; ');
  const said = [
    ...(owed.length ? [`still owed: ${line(owed)}`] : []),
    ...(unread.length ? [`settled but unread: ${line(unread)}`] : []),
  ];
  const badge = [
    ...(owed.length ? [`${owed.length} owed`] : []),
    ...(unread.length ? [`${unread.length} unread`] : []),
  ];
  return {
    systemMessage: `dixeram ▸ this repo has ${badge.join(', ')}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `dixeram: in this repo, ${said.join('. ')}. Mention these in one line at the start of your ` +
        'first reply (the ledger is `dixeram open`), then carry on. Owed items from other sessions ' +
        'are not yours unless the user hands them to you.',
    },
  };
}
