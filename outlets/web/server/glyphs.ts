import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./glyphs.swift', import.meta.url));
const NAME = /^[a-z0-9.]+$/;

/**
 * SF Symbols as base64 PNGs, drawn by one long-lived Swift process. A name that does not draw is
 * cached as missing. The cache holds one entry per symbol a repo's `.hued` names, so it stays small.
 */
export function createGlyphs() {
  const cache = new Map<string, string | null>();
  let child: ChildProcess | null = null;
  let buffered = '';
  const waiting: ((line: string) => void)[] = [];
  let chain: Promise<unknown> = Promise.resolve();

  const ask = (names: string[]) =>
    new Promise<Record<string, string>>((resolve) => {
      if (!child) {
        child = spawn('swift', [SCRIPT], { stdio: ['pipe', 'pipe', 'ignore'] });
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          buffered += chunk;
          for (let i = buffered.indexOf('\n'); i >= 0; i = buffered.indexOf('\n')) {
            const line = buffered.slice(0, i);
            buffered = buffered.slice(i + 1);
            waiting.shift()?.(line);
          }
        });
        child.on('exit', () => {
          child = null;
          buffered = '';
          for (const w of waiting.splice(0)) w('{}');
        });
        child.unref();
      }
      waiting.push((line) => {
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({});
        }
      });
      child.stdin?.write(`${names.join(' ')}\n`);
    });

  return async (names: string[]): Promise<Record<string, string>> => {
    const wanted = [...new Set(names.filter((n) => NAME.test(n)))];
    const missing = wanted.filter((n) => !cache.has(n));
    if (missing.length) {
      const run = chain.then(() => ask(missing));
      chain = run;
      const drawn = await run;
      for (const n of missing) cache.set(n, drawn[n] ?? null);
    }
    const out: Record<string, string> = {};
    for (const n of wanted) {
      const png = cache.get(n);
      if (png) out[n] = png;
    }
    return out;
  };
}
