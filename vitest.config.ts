import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('src/engine', import.meta.url)) } },
});
