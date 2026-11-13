import { contextOf } from './context.ts';
import { detect } from './detect.ts';
import { NAG_WINDOW_MS } from './paths.ts';
import type { Store } from './store.ts';

export type Payload = Record<string, unknown>;
export type HookOutput = Record<string, unknown> | null;

const quote = (s: string, n = 80) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;

export function promptHook(store: Store, p: Payload, configDir?: string): HookOutput {
  const prompt = typeof p.prompt === 'string' ? p.prompt : '';
  const { forced, candidate } = detect(prompt);
  if (!candidate) return null;
  const turn = store.addTurn(
    contextOf({ session: p.session_id, transcript: p.transcript_path, cwd: p.cwd, configDir }),
    prompt,
  );
  const lead = forced
    ? 'dixeram: the user marked this prompt with `??`, so it asks you at least one direct question.'
    : 'dixeram: this prompt may ask you something directly.';
  return {
    systemMessage: forced
      ? 'dixeram ▸ marked with ??, so Claude will file this prompt as a question'
      : 'dixeram ▸ this prompt might hold a question; Claude will file it if so',
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `${lead} For each direct question in it (one the user wants answered, not a request worded as a question), ` +
        `call the dixeram \`ask\` tool with turn "${turn.id}" before starting the work, then call \`answer\` for each ` +
        'as soon as you know the answer. Answer in chat as usual too. The `answer` text is read later in an inbox, ' +
        'away from this conversation, so make it stand on its own. Keep the user posted in chat: after `ask`, say ' +
        'in one short line what you filed (e.g. "Filed as q-17."), and end each answer in chat with its id ' +
        '(e.g. "(q-17 → inbox)").' +
        (forced ? '' : ' If nothing here is a direct question, ignore this.'),
    },
  };
}

/** Holds the turn open, once per question, while something asked in this session is unanswered. */
export function stopHook(store: Store, p: Payload): HookOutput {
  const session = typeof p.session_id === 'string' ? p.session_id : null;
  if (!session) return null;
  const open = store.unchased(session, store.now() - NAG_WINDOW_MS);
  if (!open.length) return null;
  store.markChased(open.map((q) => q.id));
  const list = open.map((q) => `${q.ref} ${quote(q.question)}`).join(', ');
  return {
    systemMessage: `dixeram ▸ holding the turn open: ${open.map((q) => q.ref).join(', ')} still unanswered`,
    decision: 'block',
    reason:
      `dixeram: ${list} ${open.length === 1 ? 'was' : 'were'} recorded but never answered. ` +
      'Call the dixeram `answer` tool for each before stopping. If one cannot be answered yet, answer with ' +
      'what is known and what is still open.',
  };
}

/** On a fresh session, unread answers from earlier sessions in this repo, so they get mentioned once. */
export function sessionStartHook(store: Store, p: Payload): HookOutput {
  if (p.source !== 'startup' || typeof p.cwd !== 'string') return null;
  const { repo } = contextOf({ cwd: p.cwd });
  if (!repo) return null;
  const unread = store.list('unread', { repo, limit: 6 });
  if (!unread.length) return null;
  const list = unread.map((q) => `${q.ref} ${quote(q.question, 60)}`).join('; ');
  return {
    systemMessage: `dixeram ▸ ${unread.length} unread ${unread.length === 1 ? 'answer' : 'answers'} from this repo: ${unread.map((q) => q.ref).join(', ')}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `dixeram: the user has unread answers to questions asked in this repo: ${list}. ` +
        'Mention them in one line at the start of your first reply (the inbox is `dixeram open`), then carry on.',
    },
  };
}
