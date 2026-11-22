// What a stretch of a transcript cost in tokens, and kouhai's share of it.
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { isPrompt, type Line } from './transcript.ts';

/** Where the API gives no count, a token is estimated at 4 characters. */
export const tokensOf = (chars: number) => chars / 4;

/** Token totals from API usage, beside kouhai's estimated part of them. */
export type Spend = {
  calls: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  /** The part of `cacheWrite` cached for an hour, billed at twice the input price rather than 1.25×. */
  cacheWrite1h: number;
  output: number;
  /** Tokens kouhai put into context: hook injections, its tool calls and their results. */
  kouhaiAdded: number;
  /** The part of `kouhaiAdded` the model wrote: the arguments of its calls to kouhai. */
  kouhaiOutput: number;
  /** Kouhai tokens re-read over all calls, its fixed instructions and schemas included. */
  kouhaiRead: number;
  /** Calls forced by a step that called only kouhai's tools, and the context they re-read. */
  trips: number;
  tripRead: number;
  model: string | null;
};

/**
 * What each kind of token costs relative to an uncached input token, at Opus 5.5's API prices
 * (2026-11-03): reads are 0.10× on most other models, and output 5× on all current ones.
 */
export const WEIGHTS = { input: 1, cacheRead: 0.05, cacheWrite: 1.25, cacheWrite1h: 2, output: 5 };

type Weighed = Pick<
  Spend,
  | 'input'
  | 'cacheRead'
  | 'cacheWrite'
  | 'cacheWrite1h'
  | 'output'
  | 'kouhaiAdded'
  | 'kouhaiOutput'
  | 'kouhaiRead'
  | 'tripRead'
>;

/** A spend in input-token equivalents, everything in it and kouhai's part. */
export function weighed(s: Weighed): { all: number; kouhai: number } {
  const w = WEIGHTS;
  const write5m = s.cacheWrite - s.cacheWrite1h;
  const all =
    s.input * w.input +
    s.cacheRead * w.cacheRead +
    write5m * w.cacheWrite +
    s.cacheWrite1h * w.cacheWrite1h +
    s.output * w.output;
  // Kouhai's tokens are written to the cache once, then read on every call after; its tool
  // arguments are output; a forced trip re-reads the whole context.
  const writeWeight = s.cacheWrite
    ? (write5m * w.cacheWrite + s.cacheWrite1h * w.cacheWrite1h) / s.cacheWrite
    : w.cacheWrite1h;
  const kouhai =
    s.kouhaiAdded * writeWeight +
    s.kouhaiRead * w.cacheRead +
    s.kouhaiOutput * w.output +
    s.tripRead * w.cacheRead;
  return { all, kouhai };
}

type Usage = {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_1h_input_tokens?: number };
  output_tokens?: number;
};
type Block = {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
};
type Message = { id?: string; model?: string; content?: unknown; usage?: Usage };

const ours = (s: string) => /kouhai|dixeram/.test(s);

/**
 * Meters `lines`. `live` is the kouhai tokens already in context where they begin, and `fixed`
 * what kouhai adds to every request. Lines before `from` only move `live`: they were paid for
 * by an earlier turn. Returns the spend and `live` where the lines end.
 */
export function meter(
  lines: Line[],
  fixed: number,
  live = 0,
  from = 0,
): { spend: Spend; live: number } {
  const s: Spend = {
    calls: 0,
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    output: 0,
    kouhaiAdded: 0,
    kouhaiOutput: 0,
    kouhaiRead: 0,
    trips: 0,
    tripRead: 0,
    model: null,
  };
  const mine = new Set<string>();
  const seen = new Set<string>();
  const tools = new Map<string, string[]>();
  const calls: [string, number][] = [];
  lines.forEach((d, i) => {
    const counted = i >= from;
    const add = (tok: number) => {
      live += tok;
      if (counted) s.kouhaiAdded += tok;
    };
    if (d.type === 'system' && d.subtype === 'compact_boundary') live = 0;
    const a = d.attachment;
    if (a?.type === 'hook_additional_context')
      for (const c of [a.content].flat())
        if (typeof c === 'string' && ours(c.slice(0, 8))) add(tokensOf(c.length));
    const m = d.message as Message | undefined;
    for (const b of (Array.isArray(m?.content) ? m.content : []) as Block[]) {
      if (b.type === 'tool_use' && m?.id) {
        const names = tools.get(m.id) ?? [];
        names.push(b.name ?? '');
        tools.set(m.id, names);
      }
      if (b.type === 'tool_use' && b.id && ours(b.name ?? '')) {
        mine.add(b.id);
        const tok = tokensOf(JSON.stringify(b.input).length + (b.name ?? '').length);
        add(tok);
        if (counted) s.kouhaiOutput += tok;
      } else if (b.type === 'tool_result' && b.tool_use_id && mine.has(b.tool_use_id)) {
        add(tokensOf(JSON.stringify(b.content).length));
      }
    }
    const u = d.type === 'assistant' ? m?.usage : undefined;
    if (!u || !m?.id || seen.has(m.id) || !counted) return;
    seen.add(m.id);
    const ctx =
      (u.input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    s.calls++;
    s.input += u.input_tokens ?? 0;
    s.cacheRead += u.cache_read_input_tokens ?? 0;
    s.cacheWrite += u.cache_creation_input_tokens ?? 0;
    s.cacheWrite1h += u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    s.output += u.output_tokens ?? 0;
    s.kouhaiRead += live + fixed;
    s.model = m.model ?? s.model;
    calls.push([m.id, ctx]);
  });
  for (let i = 0; i + 1 < calls.length; i++) {
    const names = tools.get(calls[i]?.[0] ?? '') ?? [];
    if (names.length && names.every(ours)) {
      s.trips++;
      s.tripRead += calls[i + 1]?.[1] ?? 0;
    }
  }
  return { spend: s, live };
}

/** The index of the last prompt the user typed, or 0. */
export function lastPrompt(lines: Line[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (isPrompt(lines[i] as Line)) return i;
  return 0;
}

/**
 * The whole lines of a transcript from byte `offset`, and the offset after the last of them. A
 * file shorter than `offset` was replaced, so it is read from the start.
 */
export function linesFrom(path: string, offset: number): { lines: Line[]; end: number } {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return { lines: [], end: offset };
  }
  try {
    const size = fstatSync(fd).size;
    const start = size < offset ? 0 : offset;
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const whole = buf.lastIndexOf(0x0a) + 1;
    const lines = buf
      .subarray(0, whole)
      .toString('utf8')
      .split('\n')
      .flatMap((l) => {
        try {
          return l ? [JSON.parse(l) as Line] : [];
        } catch {
          return [];
        }
      });
    return { lines, end: start + whole };
  } finally {
    closeSync(fd);
  }
}
