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
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `${lead} For each direct question in it (one the user wants answered, not a request worded as a question), ` +
        `call the dixeram \`ask\` tool with turn "${turn.id}" before starting the work, then call \`answer\` for each ` +
        'as soon as you know the answer. Answer in chat as usual too. The `answer` text is read later in an inbox, ' +
        'away from this conversation, so make it stand on its own.' +
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
    decision: 'block',
    reason:
      `dixeram: ${list} ${open.length === 1 ? 'was' : 'were'} recorded but never answered. ` +
      'Call the dixeram `answer` tool for each before stopping. If one cannot be answered yet, answer with ' +
      'what is known and what is still open.',
  };
}
