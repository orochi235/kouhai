import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './daemon.ts';
import { Store } from './store.ts';

const ctx = { session: 's', harness: 'claude', cwd: '/c', root: '/c', repo: 'c', transcript: null };
let close = () => {};
afterEach(() => close());

async function up() {
  const s = new Store(':memory:');
  const server = createServer(s);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: object) =>
    fetch(base + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
  return { s, base, post };
}

describe('daemon', () => {
  it('lists, marks read, and refuses to reveal a path nobody attached', async () => {
    const { s, base, post } = await up();
    s.ask(['why?'], null, ctx);
    s.answer('q-1', 'because', [{ kind: 'file', ref: '/tmp/x' }]);
    const list = await fetch(`${base}/api/questions?filter=unread`).then((r) => r.json());
    expect(list.counts.unread).toBe(1);
    expect(list.repos[0]).toMatchObject({ repo: 'c', unread: 1 });
    await post('/api/read', { id: 'q-1' });
    expect(s.counts().unread).toBe(0);
    const r = await fetch(`${base}/api/reveal`, {
      method: 'POST',
      body: JSON.stringify({ id: 'q-1', ref: '/etc/passwd' }),
    });
    expect(r.status).toBe(404);
  });

  it('rejects an unknown filter', async () => {
    const { base } = await up();
    expect((await fetch(`${base}/api/questions?filter=nope`)).status).toBe(400);
  });
});
