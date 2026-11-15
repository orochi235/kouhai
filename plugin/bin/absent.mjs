// Stand-in MCP server for a machine where dixeram is not installed: no tools, and
// instructions saying how to install it. Plain JS, since the cached plugin has no src/.
import { createInterface } from 'node:readline';

const INSTRUCTIONS =
  'dixeram is not installed on this machine, so nothing can be filed. ' +
  'To install: clone orochi235/dixeram to ~/src/dixeram, then `npm install && npm run build && npm run service:install` there.';

for await (const line of createInterface({ input: process.stdin })) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    continue;
  }
  if (msg.id === undefined) continue;
  const result =
    msg.method === 'initialize'
      ? {
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'dixeram', version: 'absent' },
          instructions: INSTRUCTIONS,
        }
      : msg.method === 'tools/list'
        ? { tools: [] }
        : msg.method === 'ping'
          ? {}
          : null;
  const reply = result
    ? { jsonrpc: '2.0', id: msg.id, result }
    : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } };
  process.stdout.write(`${JSON.stringify(reply)}\n`);
}
