import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, notePath } from './daemon.ts';
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
    s.take([{ kind: 'question', text: 'why?' }], null, ctx);
    s.settle('q-1', 'answered', 'because', [{ kind: 'file', ref: '/tmp/x' }]);
    const list = await fetch(`${base}/api/items?filter=unread`).then((r) => r.json());
    expect(list.counts.unread).toBe(1);
    expect(list.repos[0]).toMatchObject({ repo: 'c', unread: 1, owed: 0 });
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
    expect((await fetch(`${base}/api/items?filter=nope`)).status).toBe(400);
  });
});

describe('notePath', () => {
  const here = new URL(import.meta.url).pathname;
  it('opens only an existing absolute path the note links', () => {
    const note = `see [daemon.test.ts:3](${here}:3)`;
    expect(notePath(note, `${here}:3`)).toBe(here);
    expect(notePath(note, `file://${here}`)).toBe(here);
    expect(notePath(note, '/etc/passwd')).toBeNull();
    expect(notePath(`[x](/nope/missing.ts)`, '/nope/missing.ts')).toBeNull();
    expect(notePath(note, 'relative/path.ts')).toBeNull();
  });
});
