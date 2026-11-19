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

function engine(on: any, fork: unknown, filed = { exitCode: 0, stdout: 'q-9\n', stderr: '' }) {
  const runs: { argv: string[]; stdin: string }[] = [];
  on('command.register', () => ({ value: { command: 'ask' } }));
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }));
  on('model.fork', () => ({ value: fork }));
  on('session.id', () => ({ value: 's1' }));
  on('session.cwd', () => ({ value: '/r' }));
  on('process.run', (_: unknown, e: { argv: string[]; init?: { stdin: string } }) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin ?? '' });
    return { value: filed };
  });
  on('command.run', () => ({ text: 'the built-in /btw' }));
  return runs;
}

test('/ask answers from the fork and keeps the answer in dixeram', async ($, on) => {
  const runs = engine(on, ANSWER);
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true });
  const out = await $.command.run({ command: 'ask', args: 'which column marks a /btw?' });
  expect(out.text).toBe('The `via` column.\n\n(kept as q-9)');
  expect(runs[0]?.argv).toEqual(['dixeram', 'aside']);
  expect(JSON.parse(runs[0]?.stdin ?? '{}')).toMatchObject({
    session: 's1',
    cwd: '/r',
    question: 'which column marks a /btw?',
    via: 'ask',
    usage: { cache_read_input_tokens: 236000 },
  });
});

test('/btw is answered the same way, marked btw', async ($, on) => {
  const runs = engine(on, ANSWER);
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true });
  const out = await $.command.run({ command: 'btw', args: 'what is PBT?' });
  expect(out.text).toContain('(kept as q-9)');
  expect(JSON.parse(runs[0]?.stdin ?? '{}').via).toBe('btw');
});

test('/btw falls back to the built-in when the fork has nothing to fork', async ($, on) => {
  const runs = engine(on, { isAnswered: false, reason: 'nothing-to-fork' });
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true });
  const out = await $.command.run({ command: 'btw', args: 'what is PBT?' });
  expect(out.text).toBe('the built-in /btw');
  expect(runs).toHaveLength(0);
});

test('the answer still shows when dixeram cannot keep it', async ($, on) => {
  engine(on, ANSWER, { exitCode: 1, stdout: '', stderr: 'no store' });
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true });
  const out = await $.command.run({ command: 'ask', args: 'which column?' });
  expect(out.text).toBe('The `via` column.');
});
