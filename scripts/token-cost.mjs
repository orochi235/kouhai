#!/usr/bin/env node
// What kouhai costs a session, from its transcript: the tokens kouhai adds to context (hook
// injections, its tool calls and their results) and how many times every later API call re-reads
// them. Measured the way the Stop hook measures each turn (`src/engine/meter.ts`).
// Usage: scripts/token-cost.mjs <transcript.jsonl>... [--fixed <chars>]
import { linesFrom, meter, tokensOf, weighed } from '../src/engine/meter.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--fixed');
// The MCP server's instructions and tool schemas sit in every request's system prompt.
const fixed = tokensOf(at >= 0 ? Number(args.splice(at, 2)[1]) : 0);

const pad = (s, n) => String(s).padStart(n);
console.log(
  `${'calls'.padStart(6)} ${'context read'.padStart(13)} ${'kouhai read'.padStart(13)} ${'share'.padStart(6)} ${'added'.padStart(7)} ${'trips'.padStart(5)} ${'trip read'.padStart(11)} ${'trip share'.padStart(10)} ${'extra'.padStart(6)}  transcript`,
);
for (const p of args) {
  const { spend: m } = meter(linesFrom(p, 0).lines, fixed);
  const reads = m.input + m.cacheRead + m.cacheWrite;
  const w = weighed(m);
  console.log(
    `${pad(m.calls, 6)} ${pad(reads, 13)} ${pad(Math.round(m.kouhaiRead), 13)} ${pad(((100 * m.kouhaiRead) / (reads || 1)).toFixed(1), 5)}% ${pad(Math.round(m.kouhaiAdded), 7)} ${pad(m.trips, 5)} ${pad(m.tripRead, 11)} ${pad(((100 * m.tripRead) / (reads || 1)).toFixed(1), 9)}% ${pad(((100 * w.kouhai) / (w.all - w.kouhai || 1)).toFixed(1), 5)}%  ${p.split('/').slice(-2).join('/')}`,
  );
}
