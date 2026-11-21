// Assembles the published site: the landing page from `site/` at `_site/`, and the page built
// over the sample ledger at `_site/demo/`. Run by `.github/workflows/site.yml`, and locally with
// `npm run site` to see what it will publish.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';

const OUT = '_site';
/** Where Pages serves the demo from, which the bundle's asset URLs are written against. */
const BASE = process.env.KOUHAI_SITE_BASE ?? '/kouhai/demo/';

const FONTS: Record<string, string> = {
  'instrument-serif-400.woff2':
    '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
  'newsreader.woff2': '@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2',
  'newsreader-italic.woff2':
    '@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2',
  'ibm-plex-mono-400.woff2': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
};

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/fonts`, { recursive: true });

console.log('1/3  the landing page');
await cp('site', OUT, { recursive: true });
for (const [to, from] of Object.entries(FONTS))
  await cp(`node_modules/${from}`, `${OUT}/fonts/${to}`);

console.log('2/3  the page, as the demo');
const built = spawnSync(
  'npx',
  [
    'vite',
    'build',
    'outlets/web',
    '--base',
    BASE,
    '--outDir',
    `../../${OUT}/demo`,
    '--emptyOutDir',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_KOUHAI_DEMO: '1', WEASEL: process.env.WEASEL ?? '../weasel' },
  },
);
if (built.status !== 0) process.exit(built.status ?? 1);
await rm(`${OUT}/demo/lab.html`, { force: true });

console.log(`3/3  ${OUT}/ is ready`);
