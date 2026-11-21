import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unledgeredMidTurn } from './transcript.ts';

const prompt = (text: string) => ({
  type: 'user',
  origin: { kind: 'human' },
  message: { role: 'user', content: text },
});
const mid = (text: string, id: string) => ({
  type: 'attachment',
  attachment: {
    type: 'queued_command',
    prompt: text,
    source_uuid: id,
    commandMode: 'prompt',
    humanTurn: true,
  },
});
const call = (name: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name }] },
});
const toolResult = { type: 'user', message: { content: [{ type: 'tool_result' }] } };

function file(lines: object[]) {
  const p = join(mkdtempSync(join(tmpdir(), 'kouhai-')), 't.jsonl');
  writeFileSync(p, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  return p;
}

describe('unledgeredMidTurn', () => {
  it('finds messages queued during the current turn only', () => {
    const p = file([
      prompt('a'),
      mid('old', 'm0'),
      prompt('b'),
      call('Bash'),
      toolResult,
      mid('also do x', 'm1'),
    ]);
    expect(unledgeredMidTurn(p)).toEqual([{ key: 'm1', text: 'also do x' }]);
  });

  it('forgets messages the agent filed after', () => {
    const p = file([
      prompt('b'),
      mid('do x', 'm1'),
      call('mcp__plugin_kouhai_kouhai__take'),
      mid('and y', 'm2'),
    ]);
    expect(unledgeredMidTurn(p).map((m) => m.key)).toEqual(['m2']);
  });

  it('returns nothing for a missing file', () => {
    expect(unledgeredMidTurn('/nope.jsonl')).toEqual([]);
  });
});
