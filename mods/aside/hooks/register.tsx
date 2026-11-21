import type { EngineInterface, Register } from 'claude-code';
import { atom, read, update } from 'claude-code';

import type { Aside, Via } from '../types';

const PANE = 'aside';
const shown = atom({ plugin: 'kouhai-aside', key: 'shown' } as const, null);
const recent = atom({ plugin: 'kouhai-aside', key: 'recent' } as const, []);

/** How many earlier asides a fork is shown, so a follow-up can lean on them. */
const CARRIED = 3;

// Naming an effort here would make the fork rewrite the whole conversation to the cache on
// models that take effort per request; asking for haste in the prompt keeps the cached prefix.
const HASTE =
  '(A side question, asked without interrupting the work above. You have no tools: answer it ' +
  'from this conversation, briefly and straight away, without thinking it over at length.)';

/** The fork's prompt: earlier asides first, since they live outside the transcript it reads. */
function promptFor(question: string, earlier: readonly Aside[]): string {
  const before = earlier
    .slice(-CARRIED)
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n');
  return (
    (before ? `Earlier side questions this session, not in the transcript:\n\n${before}\n\n` : '') +
    `${question}\n\n${HASTE}`
  );
}

/** Why a fork gave no answer, in words for the person. */
const WHY: Record<string, string> = {
  'nothing-to-fork':
    'There is no conversation to answer from yet: after a start, a resume, or /clear, side questions work once a turn has finished.',
  'api-error': 'The API refused the request.',
  'empty-reply': 'The model replied with nothing.',
  aborted: 'The question was cut off.',
};

/** Forks the live session with the question and files the answer, or says why there is none. */
async function answer(
  $: EngineInterface,
  question: string,
  via: Via,
): Promise<Aside | { why: string }> {
  const r = await $.model.fork({ prompt: promptFor(question, await read($, recent)) });
  if (!r.isAnswered) return { why: WHY[r.reason] ?? `No answer (${r.reason}).` };
  const [session, cwd] = await Promise.all([$.session.id(), $.session.cwd()]);
  const filed = await $.process
    .run(['kouhai', 'aside'], {
      stdin: JSON.stringify({ session, cwd, question, answer: r.text, via, usage: r.usage }),
    })
    .catch((err: Error) => ({ exitCode: 1, stdout: '', stderr: err.message }));
  const ref = filed.exitCode === 0 ? filed.stdout.trim() || null : null;
  if (!ref)
    $.ui.toast(`kouhai couldn't keep that answer: ${filed.stderr.trim().split('\n').pop()}`);
  const aside: Aside = { question, answer: r.text, ref, via };
  await update($, recent, (list) => [...list, aside].slice(-CARRIED));
  return aside;
}

const line = (a: Aside) => `${a.answer}${a.ref ? `\n\n(kept as ${a.ref})` : ''}`;

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ask',
      description:
        'Ask a side question about this conversation; the answer is printed and kept in kouhai',
      argumentHint: '<question>',
      immediate: true,
    });
    return next(e);
  });

  on('command.run', { command: 'ask' }, async ($, e) => {
    const question = e.args.trim();
    if (!question) return { text: 'Usage: /ask <question>' };
    const a = await answer($, question, 'ask');
    return { text: 'why' in a ? a.why : line(a) };
  });

  // The built-in /btw shows its answer once and keeps it nowhere. This one shows it the same way,
  // in a pane Escape closes and the main agent never reads, and keeps it; the built-in runs when
  // the fork can't answer.
  on('command.run', { command: 'btw' }, async ($, e, next) => {
    const question = e.args.trim();
    if (!question) return next(e);
    // The built-in answers what the fork can't; the history importer files its question.
    const a = await answer($, question, 'btw');
    if ('why' in a) return next(e);
    await update($, shown, () => a);
    const opened = await $.ui.open({
      id: PANE,
      title: '/btw',
      focus: true,
      closeOnEscape: true,
      holdToasts: true,
      backgroundColor: 'transparent',
    });
    return opened.isPlaced ? {} : { text: line(a) };
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Markdown, Text } = $.ui.resolve(e);
    const a = await read($, shown);
    if (!a) return <Text dimColor>Nothing asked yet.</Text>;
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{a.question}</Text>
        <Markdown text={a.answer} />
        <Text dimColor>{`${a.ref ? `Kept as ${a.ref}. ` : ''}Escape closes.`}</Text>
      </Box>
    );
  });
};
