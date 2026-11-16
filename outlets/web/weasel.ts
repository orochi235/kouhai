import path from 'node:path';
import type { Plugin, UserConfig } from 'vite';

/**
 * `WEASEL=<checkout>` serves every `@weasel-js` import from that weasel checkout's built packages
 * instead of the pinned ones, while the page needs a weasel change no release carries yet (the
 * shortcut sheet, 2026-11-15). Everything comes from it at once, because its packages are built
 * against each other; React stays dixeram's, since a second copy breaks context.
 */
export function weaselCheckout(): Pick<
  UserConfig,
  'plugins' | 'resolve' | 'server' | 'optimizeDeps'
> {
  const root = process.env.WEASEL;
  if (!root) return {};
  const checkout = path.resolve(root);
  // Vite resolves a bare import from the importer's directory only when that file exists.
  const importer = path.join(checkout, 'package.json');
  const plugin: Plugin = {
    name: 'dixeram:weasel-checkout',
    enforce: 'pre',
    resolveId(id, _from, options) {
      if (!id.startsWith('@weasel-js/')) return null;
      return this.resolve(id, importer, { ...options, skipSelf: true });
    },
  };
  return {
    plugins: [plugin],
    resolve: { dedupe: ['react', 'react-dom'] },
    // The prebundle cache does not key on where a package resolved, so a switch serves the old one.
    optimizeDeps: { force: true },
    server: { fs: { allow: [checkout, path.resolve(import.meta.dirname, '../..')] } },
  };
}
