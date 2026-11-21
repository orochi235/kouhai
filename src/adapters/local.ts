import type { Adapter } from './adapter.ts';

/** The ledger on its own: SQLite already holds every item, so there is nothing to send anywhere. */
export function createLocalAdapter(name = 'local'): Adapter {
  return {
    name,
    file: async () => null,
    settle: async () => {},
  };
}
