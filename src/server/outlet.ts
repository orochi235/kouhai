import type { Store } from '../engine/store.ts';

/** What an outlet may read: the ledger's queries, never its writes. */
export type Ledger = Pick<Store, 'list' | 'get' | 'counts' | 'version'>;

export type Handler = (q: URLSearchParams, body: Record<string, unknown>) => unknown;

/**
 * A way of showing the ledger: the web page, the menu bar, an overlay. The server mounts an outlet's
 * routes under `/outlets/<name>/` and its static files at `mount`; the engine never knows it exists.
 */
export type Outlet = {
  name: string;
  /** Built files to serve, and the URL prefix to serve them at (`/` for the main page). */
  static?: { dir: string; mount: string };
  /** Routes relative to `/outlets/<name>`, e.g. `GET /menu`. */
  routes?: (ledger: Ledger) => Record<string, Handler>;
};
