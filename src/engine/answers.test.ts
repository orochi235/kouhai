import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answersIn } from './answers.ts';
import { RefScheme } from './refs.ts';

const file = (lines: object[]) => {
  const p = join(mkdtempSync(join(tmpdir(), 'kouhai-')), 't.jsonl');
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n'));
  return p;
};
const prompt = (text: string) => ({
  type: 'user',
  origin: { kind: 'human' },
  message: { content: text },
});
const say = (text: string, ...tools: object[]) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }, ...tools] },
});
const take = (id: string, items: object[]) => ({
  type: 'tool_use',
  id,
  name: 'mcp__plugin_kouhai_kouhai__take',
  input: { items },
});
const result = (id: string, text: string) => ({
  type: 'user',
  message: {
    content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }],
  },
});

describe('answersIn', () => {
  it('cuts each answer from the paragraphs ending with its citation', () => {
    const path = file([
      prompt('two questions'),
      say(
        'Filed q-1 #first, q-2 #second. The first answer.\n\nMore of it. [[q-1](http://x/?q=q-1)]\n\nThe second answer. [q-2]\n\nNow some work.',
      ),
    ]);
    expect(answersIn(path, new RefScheme())).toEqual([
      { ref: 'q-1', note: 'The first answer.\n\nMore of it.', extra: {} },
      { ref: 'q-2', note: 'The second answer.', extra: {} },
    ]);
  });

  it("maps a slug to the ref take gave it, with take's verdict", () => {
    const path = file([
      prompt('a question'),
      say(
        'Yes, it does. [#does-it]',
        take('t1', [{ kind: 'question', text: 'does it?', slug: 'does-it', verdict: 'Yes.' }]),
      ),
      result('t1', 'Filed in the kouhai ledger:\nq-7 #does-it-2: does it?\nTell the user.'),
    ]);
    expect(answersIn(path, new RefScheme())).toEqual([
      { ref: 'q-7', note: 'Yes, it does.', extra: { verdict: 'Yes.', basis: null, scope: null } },
    ]);
  });

  it('ignores a citation inside a code span', () => {
    const path = file([prompt('how?'), say('End with `[q-17]` like this. [q-3]')]);
    expect(answersIn(path, new RefScheme())).toEqual([
      { ref: 'q-3', note: 'End with `[q-17]` like this.', extra: {} },
    ]);
  });

  it('reads only the last turn', () => {
    const path = file([
      prompt('old'),
      say('Old answer. [q-1]'),
      prompt('new'),
      say('No citations.'),
    ]);
    expect(answersIn(path, new RefScheme())).toEqual([]);
  });
});
