import { fileURLToPath } from 'node:url';
import type { Outlet } from '../../src/server/outlet.ts';
import { createGlyphs } from './server/glyphs.ts';

const glyphs = createGlyphs();

/** The ledger page, served at `/` from its Vite build, and the SF Symbols its project chips wear. */
export const web: Outlet = {
  name: 'web',
  static: { dir: fileURLToPath(new URL('./dist/', import.meta.url)), mount: '/' },
  routes: () => ({
    'GET /glyphs': (q) => glyphs((q.get('names') ?? '').split(/[\s,]+/).filter(Boolean)),
  }),
};
