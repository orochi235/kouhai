import type { Store } from '../engine/store.ts';
import { isRouted, type Route } from './adapter.ts';

/**
 * Hands each due outbox event to the adapters routed its item, recording what they return.
 * An event leaves the outbox once every one of them has it; a failure keeps it for a retry.
 */
export async function drain(store: Store, routes: Route[]): Promise<void> {
  for (const ev of store.outbox.due()) {
    const item = store.get(ev.item);
    // Pruned since it was filed: nobody is owed news of it.
    if (!item) {
      store.outbox.finish(ev.id);
      continue;
    }
    const done = new Set(ev.done);
    const errors: string[] = [];
    for (const { adapter } of routes.filter(
      (r) => isRouted(r, item) && !done.has(r.adapter.name),
    )) {
      try {
        if (ev.event === 'filed') {
          const at = await adapter.file(item);
          if (at) store.setExternal(item.id, { adapter: adapter.name, ...at });
        } else {
          const at = item.external.find((e) => e.adapter === adapter.name) ?? null;
          await adapter.settle(item, at && { key: at.key, url: at.url });
        }
        done.add(adapter.name);
      } catch (err) {
        errors.push(`${adapter.name}: ${(err as Error).message}`);
      }
    }
    if (errors.length) store.outbox.retry(ev.id, [...done], errors.join('; '));
    else store.outbox.finish(ev.id);
  }
}
