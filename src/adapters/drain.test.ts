import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS } from '../engine/outbox.ts';
import { Store } from '../engine/store.ts';
import type { Context, Item } from '../engine/types.ts';
import type { Adapter, Recorded, Route } from './adapter.ts';
import { drain } from './drain.ts';
import { createLocalAdapter } from './local.ts';

const ctx = (repo: string): Context => ({
  session: 's',
  harness: null,
  cwd: `/${repo}`,
  root: `/${repo}`,
  repo,
  transcript: null,
});

function setup() {
  let t = 1_000_000;
  const s = new Store(':memory:', () => t);
  return { s, tick: (ms: number) => (t += ms) };
}

/** Records what it hears; fails while `down` is set. */
function tracker(name = 'tracker') {
  const heard: string[] = [];
  const state = { down: false };
  const adapter: Adapter = {
    name,
    async file(item: Item): Promise<Recorded> {
      if (state.down) throw new Error('down');
      heard.push(`file ${item.ref}`);
      return { key: `TR-${item.id}`, url: `https://tr/${item.id}` };
    },
    async settle(item: Item, at: Recorded | null) {
      if (state.down) throw new Error('down');
      if (!at) throw new Error('not filed yet');
      heard.push(`settle ${at.key} ${item.outcome}`);
    },
  };
  return { adapter, heard, state };
}

describe('drain', () => {
  it('files and settles in order, recording where the adapter keeps the item', async () => {
    const { s } = setup();
    const tr = tracker();
    const [i] = s.take([{ kind: 'task', text: 'ship' }], null, ctx('r'));
    s.settle(i?.id as number, 'done', 'shipped');
    await drain(s, [{ adapter: tr.adapter }]);
    expect(tr.heard).toEqual(['file t-1', 'settle TR-1 done']);
    expect(s.get(1)?.external).toEqual([{ adapter: 'tracker', key: 'TR-1', url: 'https://tr/1' }]);
    expect(s.outbox.waiting()).toEqual([]);
  });

  it('hands an item only to the routes whose repos and kinds take it', async () => {
    const { s } = setup();
    const work = tracker('work');
    const all = tracker('all');
    const routes: Route[] = [
      { adapter: work.adapter, repos: ['job'], kinds: ['task'] },
      { adapter: all.adapter },
    ];
    s.take([{ kind: 'task', text: 'a' }], null, ctx('job'));
    s.take([{ kind: 'question', text: 'b' }], null, ctx('job'));
    s.take([{ kind: 'task', text: 'c' }], null, ctx('home'));
    await drain(s, routes);
    expect(work.heard).toEqual(['file t-1']);
    expect(all.heard).toEqual(['file t-1', 'file q-2', 'file t-3']);
  });

  it('retries a failure with backoff, without repeating adapters that already have it', async () => {
    const { s, tick } = setup();
    const ok = tracker('ok');
    const flaky = tracker('flaky');
    flaky.state.down = true;
    const routes = [{ adapter: ok.adapter }, { adapter: flaky.adapter }];
    s.take([{ kind: 'task', text: 'x' }], null, ctx('r'));
    await drain(s, routes);
    expect(s.outbox.waiting()[0]).toMatchObject({
      done: ['ok'],
      attempts: 1,
      error: 'flaky: down',
    });
    await drain(s, routes); // not due yet
    expect(s.outbox.waiting()[0]?.attempts).toBe(1);
    flaky.state.down = false;
    tick(30_000);
    await drain(s, routes);
    expect(ok.heard).toEqual(['file t-1']);
    expect(flaky.heard).toEqual(['file t-1']);
    expect(s.outbox.waiting()).toEqual([]);
  });

  it('gives up after enough attempts and leaves the event to be looked at', async () => {
    const { s, tick } = setup();
    const tr = tracker();
    tr.state.down = true;
    s.take([{ kind: 'task', text: 'x' }], null, ctx('r'));
    for (let n = 0; n < MAX_ATTEMPTS + 2; n++) {
      await drain(s, [{ adapter: tr.adapter }]);
      tick(7 * 60 * 60 * 1000);
    }
    const [ev] = s.outbox.waiting();
    expect(ev?.attempts).toBe(MAX_ATTEMPTS);
    expect(ev?.failedAt).not.toBeNull();
  });

  it('lets the local adapter take everything and record nothing', async () => {
    const { s } = setup();
    const [i] = s.take([{ kind: 'question', text: 'why?' }], null, ctx('r'));
    s.settle(i?.id as number, 'answered', 'because');
    await drain(s, [{ adapter: createLocalAdapter() }]);
    expect(s.get(1)?.external).toEqual([]);
    expect(s.outbox.waiting()).toEqual([]);
  });
});
