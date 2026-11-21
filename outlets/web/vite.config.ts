import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { weaselIcons } from '@weasel-js/icons-plugin';
import { defineConfig } from 'vite';
import { weaselCheckout } from './weasel.ts';

const weasel = weaselCheckout();

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { __KOUHAI_DEMO__: JSON.stringify(process.env.VITE_KOUHAI_DEMO === '1') },
  plugins: [react(), weaselIcons.vite({ mode: 'app' }), ...(weasel.plugins ?? [])],
  resolve: {
    alias: { '@core': fileURLToPath(new URL('../../src/engine', import.meta.url)) },
    ...weasel.resolve,
  },
  ...(weasel.optimizeDeps ? { optimizeDeps: weasel.optimizeDeps } : {}),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        lab: fileURLToPath(new URL('lab.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '::',
    proxy: { '/api': `http://127.0.0.1:${process.env.KOUHAI_PORT ?? 8771}` },
    ...weasel.server,
  },
});
