#!/usr/bin/env node
// What dixeram puts in every request's system prompt (the MCP server's instructions and tool
// schemas), and the first-turn rule, in characters and estimated tokens (4 characters each).
// Run before and after a change to how dixeram talks to agents; pass `--chars` to feed
// `token-cost.mjs --fixed`.
import { REMINDER, RULE } from '../src/capture/hooks.ts';
import { handle } from '../src/capture/mcp.ts';
import { Store } from '../src/engine/store.ts';

const s = new Store(':memory:');
const ctx = { session: null, harness: null, cwd: null, root: null, repo: null, transcript: null };
const result = (method: string) =>
  (handle(s, ctx, { jsonrpc: '2.0', id: 1, method }) as { result: Record<string, unknown> }).result;
const sizes = {
  instructions: JSON.stringify(result('initialize').instructions).length,
  tools: JSON.stringify(result('tools/list').tools).length,
  'rule (first turn)': RULE.length,
  'reminder (later turns)': REMINDER.length,
};
if (process.argv.includes('--chars')) {
  console.log(sizes.instructions + sizes.tools);
} else {
  for (const [k, v] of Object.entries(sizes))
    console.log(
      `${k.padEnd(24)} ${String(v).padStart(6)} chars ${String(Math.round(v / 4)).padStart(5)} tokens`,
    );
}
