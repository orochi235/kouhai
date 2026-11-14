import { contextOf } from '../engine/context.ts';
import { detect } from '../engine/detect.ts';
import { NAG_WINDOW_MS } from '../engine/paths.ts';
import type { Store } from '../engine/store.ts';
import { unledgeredMidTurn } from '../engine/transcript.ts';
import type { Item } from '../engine/types.ts';

export type Payload = Record<string, unknown>;
export type HookOutput = Record<string, unknown> | null;

const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;
const refs = (items: Item[]) => items.map((i) => i.ref).join(', ');

/** The filing rule, the same on every prompt and in the MCP server's instructions. */
export const RULE =
  'File with the dixeram `take` tool: (1) every direct question the user asks you, kind "question"; ' +
  '(2) any instruction you will not finish before this turn ends, kind "task" (one queued behind ' +
  'other work, one meant for later, or one that arrives mid-turn while you are busy). An instruction ' +
  'you carry out in this turn needs no filing, and neither does an instruction to build something that ' +
  'you start this turn, yourself or through an agent. A filed item stays owed until it is settled: a question ' +
  'as answered, a task as done, either as dropped (with why), or as deferred, which means moved to ' +
  'another durable home such as a TODO entry or an issue (say where). Work still waiting on a later ' +
  'turn is owed, not deferred: leave it open. Only once `take` has returned ids, say in one line what ' +
  'you filed ("Filed q-17, t-18."), and end an answer in chat with its id ("(q-17 → inbox)"); never ' +
  'announce a filing before it is accepted, and if `take` fails, say it failed rather than naming an ' +
  'id. Notes are read later, away from this ' +
  'conversation, so make them stand on their own and link generously: every file you name as a ' +
  'markdown link to its absolute path ([src/store.ts:42](/abs/path/src/store.ts)), and commits, PRs, ' +
  'issues, docs, and artifacts by URL.';

/** Last turn's answers, which this prompt may show were already read. */
function seenRule(answered: Item[]): string {
  return (
    `Last turn you answered ${answered.map((q) => `${q.ref} ${quote(q.text, 60)}`).join(', ')}. ` +
    'Clear one with the dixeram `clear` tool only when both hold: this prompt responds to that ' +
    'answer, so the user has seen it; and the answer is about something that will not outlive this ' +
    'session, such as a label on a page made for this task. Otherwise leave it in the inbox: an ' +
    'answer that lasts, or one the user moved on from, is what the inbox is for.'
  );
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
  const answered = ctx.session && since != null ? store.answeredSince(ctx.session, since) : [];
  const turn = store.addTurn(ctx, prompt);
  const { forced, candidate } = detect(prompt);
  return {
    ...(candidate
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
          ? 'The user marked this prompt with `??`: it asks at least one direct question. '
          : '') +
        RULE +
        (answered.length ? ` ${seenRule(answered)}` : ''),
    },
  };
}

/**
 * Holds the turn open once for anything that could be lost: items from this session still owed,
 * and messages the user sent mid-turn that the ledger never heard about.
 */
export function stopHook(store: Store, p: Payload): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  if (!session) return null;
  const owed = store.unchased(session, store.now() - NAG_WINDOW_MS);
  store.markChased(owed.map((i) => i.id));
  const transcript = typeof p.transcript_path === 'string' ? p.transcript_path : null;
  const mid = transcript ? unledgeredMidTurn(transcript).filter((m) => store.chaseOnce(m.key)) : [];
  if (!owed.length && !mid.length) return null;

  const questions = owed.filter((i) => i.kind === 'question');
  const tasks = owed.filter((i) => i.kind === 'task');
  const parts: string[] = [];
  if (questions.length) {
    parts.push(
      `${questions.map((q) => `${q.ref} ${quote(q.text)}`).join(', ')} still ${questions.length === 1 ? 'needs' : 'need'} an answer: settle as answered, or deferred with what is known and what is open.`,
    );
  }
  if (tasks.length) {
    parts.push(
      `${tasks.map((t) => `${t.ref} ${quote(t.text)}`).join(', ')} ${tasks.length === 1 ? 'is' : 'are'} still owed. If one is done, settle it as done; if dropped or moved to a TODO or issue, settle it so. If it is still waiting, leave it open: that is what owed means.`,
    );
  }
  if (mid.length) {
    parts.push(
      `The user sent ${mid.length === 1 ? 'a message' : 'messages'} while you were working: ${mid.map((m) => quote(m.text, 120)).join('; ')}. Check that each instruction in ${mid.length === 1 ? 'it' : 'them'} was carried out; file any that wasn't with \`take\`. An instruction to build something that you have started, yourself or through an agent, is handled: do not file it.`,
    );
  }
  const seen = [
    ...(owed.length ? [refs(owed)] : []),
    ...(mid.length ? [`${mid.length} mid-turn ${mid.length === 1 ? 'message' : 'messages'}`] : []),
  ];
  return {
    systemMessage: `dixeram ▸ holding the turn open to check ${seen.join(' and ')}`,
    decision: 'block',
    reason: `dixeram: ${parts.join(' ')}`,
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
