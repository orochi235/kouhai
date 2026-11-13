import { contextOf } from './context.ts';
import { detect } from './detect.ts';
import { NAG_WINDOW_MS } from './paths.ts';
import type { Store } from './store.ts';
import { unledgeredMidTurn } from './transcript.ts';
import type { Item } from './types.ts';

export type Payload = Record<string, unknown>;
export type HookOutput = Record<string, unknown> | null;

const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;
const refs = (items: Item[]) => items.map((i) => i.ref).join(', ');

/** The filing rule, the same on every prompt and in the MCP server's instructions. */
export const RULE =
  'File with the dixeram `take` tool: (1) every direct question the user asks you, kind "question"; ' +
  '(2) any instruction you will not finish before this turn ends, kind "task" (one queued behind ' +
  'other work, or one that arrives mid-turn while you are busy). An instruction you carry out in ' +
  'this turn needs no filing. Then `settle` each: a question as answered, a task as done, or either ' +
  'as dropped or deferred, saying why. Say in one line what you filed ("Filed q-17, t-18."), and end ' +
  'an answer in chat with its id ("(q-17 → inbox)"). Notes are read later, away from this ' +
  'conversation, so make them stand on their own.';

export function promptHook(store: Store, p: Payload, configDir?: string): HookOutput {
  const prompt = typeof p.prompt === 'string' ? p.prompt : '';
  if (!prompt.trim()) return null;
  const turn = store.addTurn(
    contextOf({ session: p.session_id, transcript: p.transcript_path, cwd: p.cwd, configDir }),
    prompt,
  );
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
        RULE,
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
      `${tasks.map((t) => `${t.ref} ${quote(t.text)}`).join(', ')} ${tasks.length === 1 ? 'is' : 'are'} still owed: settle as done if it is, or dropped/deferred with why; if you are still on it, say so and leave it open.`,
    );
  }
  if (mid.length) {
    parts.push(
      `The user sent ${mid.length === 1 ? 'a message' : 'messages'} while you were working: ${mid.map((m) => quote(m.text, 120)).join('; ')}. Check that each instruction in ${mid.length === 1 ? 'it' : 'them'} was carried out; file any that wasn't with \`take\`.`,
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
