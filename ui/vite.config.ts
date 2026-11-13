import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@core': fileURLToPath(new URL('../src', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '::', proxy: { '/api': 'http://127.0.0.1:8771' } },
});
