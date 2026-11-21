import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRoutes } from './config.ts';

const dirs: string[] = [];
const file = (body: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'kouhai-adapters-'));
  dirs.push(dir);
  const path = join(dir, 'adapters.json');
  writeFileSync(path, JSON.stringify(body));
  return path;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const jira = { kind: 'jira', site: 'https://x', project: 'K', email: 'e', token: { env: 'T' } };

describe('loadRoutes', () => {
  it('is the local adapter alone with no file', () => {
    const routes = loadRoutes('/nonexistent/adapters.json');
    expect(routes.map((r) => r.adapter.name)).toEqual(['local']);
  });

  it('builds each listed adapter with its routing', () => {
    const routes = loadRoutes(
      file({
        adapters: [{ kind: 'local' }, { ...jira, name: 'pw', repos: ['x'], kinds: ['task'] }],
      }),
    );
    expect(routes.map((r) => [r.adapter.name, r.repos, r.kinds])).toEqual([
      ['local', undefined, undefined],
      ['pw', ['x'], ['task']],
    ]);
  });

  it('says what is wrong with a bad entry', () => {
    expect(() => loadRoutes(file({ adapters: [{ kind: 'trello' }] }))).toThrow(
      /known: local, jira/,
    );
    expect(() => loadRoutes(file({ adapters: [{ ...jira, site: '' }] }))).toThrow(/needs "site"/);
    expect(() => loadRoutes(file({ adapters: [jira, jira] }))).toThrow(/two adapters named "jira"/);
    expect(() => loadRoutes(file({ adapters: [{ kind: 'local', kinds: ['bug'] }] }))).toThrow(
      /kinds takes/,
    );
  });
});
