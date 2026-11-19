import { expect, test } from 'claude-code/testing';

const ANSWER = {
  isAnswered: true,
  text: 'The `via` column.',
  usage: {
    input_tokens: 2,
    output_tokens: 9,
    cache_read_input_tokens: 236000,
    cache_creation_input_tokens: 0,
  },
};

const typed = (command: string, args: string) => ({
  command,
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 120 },
});

function engine(
  on: any,
  fork: unknown,
  { filed = { exitCode: 0, stdout: 'q-9\n', stderr: '' }, isPlaced = true } = {},
) {
  const runs: { stdin: string }[] = [];
  const prompts: string[] = [];
  const opened: unknown[] = [];
  on('command.register', () => ({ value: { command: 'ask' } }));
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }));
  on('model.fork', (_: unknown, e: { prompt: string }) => {
    prompts.push(e.prompt);
    return { value: fork };
  });
  on('session.id', () => ({ value: 's1' }));
  on('session.cwd', () => ({ value: '/r' }));
  on('process.run', (_: unknown, e: { argv: string[]; init?: { stdin: string } }) => {
    runs.push({ stdin: e.init?.stdin ?? '' });
    return { value: filed };
  });
  on('ui.open', (_: unknown, e: unknown) => {
    opened.push(e);
    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'no surface' } };
  });
  on('command.run', () => ({ text: 'the built-in /btw' }));
  return { runs, prompts, opened };
}

const start = ($: any) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true });

test('/ask prints the answer in the conversation and keeps it', async ($, on) => {
  const { runs, opened } = engine(on, ANSWER);
  await start($);
  const out = await $.command.run(typed('ask', 'which column marks a /btw?'));
  expect(out.text).toBe('The `via` column.\n\n(kept as q-9)');
  expect(opened).toHaveLength(0);
  expect(JSON.parse(runs[0]?.stdin ?? '{}')).toMatchObject({
    session: 's1',
    cwd: '/r',
    question: 'which column marks a /btw?',
    via: 'ask',
    usage: { cache_read_input_tokens: 236000 },
  });
});

test('/btw shows the answer in a pane Escape closes, and prints nothing', async ($, on) => {
  const { runs, opened } = engine(on, ANSWER);
  await start($);
  const out = await $.command.run(typed('btw', 'what is PBT?'));
  expect(out.text).toBeUndefined();
  expect(opened[0]).toMatchObject({ id: 'aside', focus: true, closeOnEscape: true });
  expect(JSON.parse(runs[0]?.stdin ?? '{}').via).toBe('btw');
  const ui = await $.ui.mount({
    plugin: 'dixeram-aside',
    component: 'Pane',
    requestId: 'aside',
    surface: 'terminal',
    props: {
      title: '/btw',
      isFocused: true,
      bodyColumns: 80,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  });
  expect((await ui.find({ type: 'Text', text: /what is PBT/ }))?.text).toBe('what is PBT?');
  expect((await ui.find({ type: 'Text', text: /Escape/ }))?.text).toBe(
    'Kept as q-9. Escape closes.',
  );
  await ui.unmount();
});

test('/btw prints the answer where no pane can be drawn', async ($, on) => {
  engine(on, ANSWER, { isPlaced: false });
  await start($);
  const out = await $.command.run(typed('btw', 'what is PBT?'));
  expect(out.text).toContain('(kept as q-9)');
});

test('a follow-up sees the side questions asked before it', async ($, on) => {
  const { prompts } = engine(on, ANSWER);
  await start($);
  await $.command.run(typed('btw', 'what is PBT?'));
  await $.command.run(typed('ask', 'and how does it shrink?'));
  expect(prompts[0]).not.toContain('Earlier side questions');
  expect(prompts[1]).toContain('Q: what is PBT?\nA: The `via` column.');
  expect(prompts[1]).toContain('and how does it shrink?');
});

test('/btw falls back to the built-in, quietly, when the fork has nothing to fork', async ($, on) => {
  const { runs } = engine(on, { isAnswered: false, reason: 'nothing-to-fork' });
  const toasts: unknown[] = [];
  on('ui.toast', (_: unknown, e: unknown) => {
    toasts.push(e);
    return { value: undefined };
  });
  await start($);
  const out = await $.command.run(typed('btw', 'what is PBT?'));
  expect(out.text).toBe('the built-in /btw');
  expect(runs).toHaveLength(0);
  expect(toasts).toHaveLength(0);
});

test('/ask says in words why a resumed session cannot answer yet', async ($, on) => {
  engine(on, { isAnswered: false, reason: 'nothing-to-fork' });
  await start($);
  const out = await $.command.run(typed('ask', 'what is PBT?'));
  expect(out.text).toContain('once a turn has finished');
});

test('the answer still shows when dixeram cannot keep it', async ($, on) => {
  engine(on, ANSWER, { filed: { exitCode: 1, stdout: '', stderr: 'no store' } });
  await start($);
  const out = await $.command.run(typed('ask', 'which column?'));
  expect(out.text).toBe('The `via` column.');
});
