import type { EngineInterface, Register } from 'claude-code';

type Via = 'btw' | 'ask';

// Naming an effort here would make the fork rewrite the whole conversation to the cache on
// models that take effort per request; asking for haste in the prompt keeps the cached prefix.
const HASTE =
  '(A side question, asked without interrupting the work above. You have no tools: answer it ' +
  'from this conversation, briefly and straight away, without thinking it over at length.)';

/** Forks the live session with the question and files the answer; null when no answer came. */
async function answer($: EngineInterface, question: string, via: Via): Promise<string | null> {
  const r = await $.model.fork({ prompt: `${question}\n\n${HASTE}` });
  if (!r.isAnswered) {
    $.ui.toast(`No answer from the fork (${r.reason})`);
    return null;
  }
  const [session, cwd] = await Promise.all([$.session.id(), $.session.cwd()]);
  const filed = await $.process
    .run(['dixeram', 'aside'], {
      stdin: JSON.stringify({ session, cwd, question, answer: r.text, via, usage: r.usage }),
    })
    .catch((err: Error) => ({ exitCode: 1, stdout: '', stderr: err.message }));
  const ref = filed.exitCode === 0 ? filed.stdout.trim() : null;
  if (!ref)
    $.ui.toast(`dixeram couldn't keep that answer: ${filed.stderr.trim().split('\n').pop()}`);
  return ref ? `${r.text}\n\n(kept as ${ref})` : r.text;
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ask',
      description: 'Ask a side question about this conversation; the answer is kept in dixeram',
      argumentHint: '<question>',
      immediate: true,
    });
    return next(e);
  });

  on('command.run', { command: 'ask' }, async ($, e) => {
    const question = e.args.trim();
    if (!question) return { text: 'Usage: /ask <question>' };
    return { text: (await answer($, question, 'ask')) ?? 'No answer came back; nothing was kept.' };
  });

  // The built-in /btw shows its answer once and keeps it nowhere; answer it here instead, and
  // fall back to the built-in when the fork can't.
  on('command.run', { command: 'btw' }, async ($, e, next) => {
    const question = e.args.trim();
    if (!question) return next(e);
    return (await answer($, question, 'btw').then((t) => (t ? { text: t } : null))) ?? next(e);
  });
};
