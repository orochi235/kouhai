import { describe, expect, it } from 'vitest';
import { lastPrompt, meter, weighed } from './meter.ts';
import type { Line } from './transcript.ts';

const prompt = (text: string): Line => ({
  type: 'user',
  origin: { kind: 'human' },
  message: { content: text },
});
const call = (id: string, usage: object, content: object[] = []): Line => ({
  type: 'assistant',
  message: { id, model: 'claude-opus-5-5', usage, content } as Line['message'],
});
const inject = (text: string): Line => ({
  type: 'attachment',
  attachment: { type: 'hook_additional_context', content: [text] },
});

describe('meter', () => {
  it('sums API usage once per call, splitting out hour-long cache writes', () => {
    const u = {
      input_tokens: 2,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 40,
      cache_creation: { ephemeral_1h_input_tokens: 30 },
      output_tokens: 7,
    };
    const { spend } = meter([call('a', u), call('a', u), call('b', u)], 0);
    expect(spend).toMatchObject({
      calls: 2,
      input: 4,
      cacheRead: 200,
      cacheWrite: 80,
      cacheWrite1h: 60,
      output: 14,
      model: 'claude-opus-5-5',
    });
  });

  it("charges kouhai's injections and fixed cost to every later call", () => {
    const lines = [inject('kouhai'.padEnd(400, '.')), call('a', {}), call('b', {})];
    const { spend, live } = meter(lines, 10);
    expect(live).toBe(100);
    expect(spend.kouhaiAdded).toBe(100);
    expect(spend.kouhaiRead).toBe(220);
  });

  it('counts a step that called only kouhai as a forced trip', () => {
    const take = { type: 'tool_use', id: 't1', name: 'mcp__plugin_kouhai_kouhai__take', input: {} };
    const { spend } = meter(
      [call('a', { input_tokens: 5 }, [take]), call('b', { cache_read_input_tokens: 900 })],
      0,
    );
    expect(spend).toMatchObject({ trips: 1, tripRead: 900 });
  });

  it('only moves what is in context before `from`', () => {
    const lines = [
      inject('kouhai'.padEnd(40, '.')),
      call('a', { input_tokens: 50 }),
      prompt('next'),
      call('b', { input_tokens: 3 }),
    ];
    const { spend } = meter(lines, 0, 0, lastPrompt(lines));
    expect(spend).toMatchObject({ calls: 1, input: 3, kouhaiAdded: 0, kouhaiRead: 10 });
  });

  it("weighs kouhai's tokens by what each kind costs", () => {
    const zero = { input: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, output: 0, tripRead: 0 };
    const w = weighed({
      ...zero,
      cacheRead: 1000,
      cacheWrite: 100,
      cacheWrite1h: 100,
      output: 10,
      kouhaiAdded: 10,
      kouhaiOutput: 4,
      kouhaiRead: 100,
    });
    expect(w.all).toBe(1000 * 0.05 + 100 * 2 + 10 * 5);
    expect(w.kouhai).toBe(10 * 2 + 100 * 0.05 + 4 * 5);
  });
});
