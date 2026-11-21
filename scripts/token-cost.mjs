#!/usr/bin/env node
// What kouhai costs a session, from its transcript: the tokens kouhai adds to context (hook
// injections, its tool calls and their results) and how many times every later API call re-reads
// them. Tokens are estimated at 4 characters each; the session's own totals come from API usage.
// Usage: scripts/token-cost.mjs <transcript.jsonl>... [--fixed <chars>]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const at = args.indexOf('--fixed');
// The MCP server's instructions and tool schemas sit in every request's system prompt.
const fixedChars = at >= 0 ? Number(args.splice(at, 2)[1]) : 0;
const tok = (chars) => chars / 4;

function measure(path) {
  let live = 0; // estimated kouhai tokens in context now
  let added = 0;
  let calls = 0;
  let reads = 0; // total context tokens over all calls
  let dixReads = 0;
  const dixTools = new Set();
  const seen = new Set();
  const tools = new Map(); // API call id → names of the tools it called
  const order = []; // API call ids in order, with their context size
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const d = JSON.parse(line);
    if (d.type === 'system' && d.subtype === 'compact_boundary') live = 0;
    if (d.type === 'attachment' && d.attachment?.type === 'hook_additional_context') {
      for (const s of [d.attachment.content].flat())
        if (typeof s === 'string' && s.startsWith('kouhai')) {
          live += tok(s.length);
          added += tok(s.length);
        }
    }
    const content = Array.isArray(d.message?.content) ? d.message.content : [];
    for (const b of content) {
      let n = 0;
      if (b.type === 'tool_use' && d.message?.id) {
        if (!tools.has(d.message.id)) tools.set(d.message.id, []);
        tools.get(d.message.id).push(b.name);
      }
      if (b.type === 'tool_use' && b.name?.includes('kouhai')) {
        dixTools.add(b.id);
        n = JSON.stringify(b.input).length + b.name.length;
      } else if (b.type === 'tool_result' && dixTools.has(b.tool_use_id)) {
        n = JSON.stringify(b.content).length;
      }
      live += tok(n);
      added += tok(n);
    }
    const u = d.type === 'assistant' && d.message?.usage;
    if (u && !seen.has(d.message.id)) {
      seen.add(d.message.id);
      calls++;
      const ctx =
        (u.input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0);
      reads += ctx;
      order.push([d.message.id, ctx]);
      dixReads += live + tok(fixedChars);
    }
  }
  // A call that used only kouhai's tools forced one more call, re-reading the whole context.
  let trips = 0;
  let tripReads = 0;
  for (let i = 0; i + 1 < order.length; i++) {
    const names = tools.get(order[i][0]) ?? [];
    if (names.length && names.every((n) => n.includes('kouhai'))) {
      trips++;
      tripReads += order[i + 1][1];
    }
  }
  return { calls, reads, dixReads, added, trips, tripReads };
}

const pad = (s, n) => String(s).padStart(n);
console.log(
  `${'calls'.padStart(6)} ${'context read'.padStart(13)} ${'kouhai read'.padStart(13)} ${'share'.padStart(6)} ${'added'.padStart(7)} ${'trips'.padStart(5)} ${'trip read'.padStart(11)} ${'trip share'.padStart(10)}  transcript`,
);
for (const p of args) {
  const m = measure(p);
  const share = m.reads ? (100 * m.dixReads) / m.reads : 0;
  console.log(
    `${pad(m.calls, 6)} ${pad(Math.round(m.reads), 13)} ${pad(Math.round(m.dixReads), 13)} ${pad(share.toFixed(1), 5)}% ${pad(Math.round(m.added), 7)} ${pad(m.trips, 5)} ${pad(m.tripReads, 11)} ${pad(((100 * m.tripReads) / (m.reads || 1)).toFixed(1), 9)}%  ${p.split('/').slice(-2).join('/')}`,
  );
}
