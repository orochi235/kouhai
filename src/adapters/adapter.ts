import type { External, Item, Kind } from '../engine/types.ts';

/** Where an adapter keeps an item in its own system. */
export type Recorded = Omit<External, 'adapter'>;

/**
 * A system that hears about items as they are filed and settled. The ledger stays the record of
 * what is owed; an adapter mirrors it somewhere else. The daemon calls these, never capture, so an
 * adapter may be slow or down without delaying a filing: a throw is retried with backoff.
 */
export interface Adapter {
  /** Unique among the configured adapters; stored with each record it makes. */
  readonly name: string;
  /** Records a newly filed item. Returns where it now lives, or null if it keeps no record of its own. */
  file(item: Item): Promise<Recorded | null>;
  /**
   * Records that an item was settled, which can happen more than once. `at` is what `file`
   * returned, or null if it returned null or has not succeeded yet; throw to wait for it.
   */
  settle(item: Item, at: Recorded | null): Promise<void>;
}

/** An adapter and the items it is handed: all of them unless `repos` or `kinds` narrows it. */
export type Route = { adapter: Adapter; repos?: string[]; kinds?: Kind[] };

export const isRouted = (r: Route, item: Item) =>
  (!r.repos || (item.repo != null && r.repos.includes(item.repo))) &&
  (!r.kinds || r.kinds.includes(item.kind));
