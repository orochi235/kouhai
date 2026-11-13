import { fileURLToPath } from 'node:url';
import type { Outlet } from '../../src/server/outlet.ts';

/** The ledger page, served at `/` from its Vite build. */
export const web: Outlet = {
  name: 'web',
  static: { dir: fileURLToPath(new URL('./dist/', import.meta.url)), mount: '/' },
};
