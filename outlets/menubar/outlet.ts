import type { Outlet } from '../../src/server/outlet.ts';
import { menu } from './menu.ts';

/** The menu bar item reads `GET /outlets/menubar/menu`: the ledger already worded for perch. */
export const menubar: Outlet = {
  name: 'menubar',
  routes: (ledger) => ({
    'GET /menu': () =>
      menu(ledger.counts(), ledger.list('unread', { limit: 8 }), ledger.list('owed', { limit: 8 })),
  }),
};
