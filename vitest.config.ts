import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('src/engine', import.meta.url)) } },
  // The mod's tests import claude-code/testing and run under `claude plugin test mods/aside`.
  test: { exclude: [...configDefaults.exclude, 'mods/**'] },
});
