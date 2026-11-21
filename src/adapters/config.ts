import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { home } from '../engine/paths.ts';
import { KINDS, type Kind } from '../engine/types.ts';
import type { Adapter, Route } from './adapter.ts';
import { createJiraAdapter, type JiraConfig } from './jira.ts';
import { createLocalAdapter } from './local.ts';

export const adaptersPath = () => join(home(), 'adapters.json');

type Entry = { kind: string; name?: string; repos?: string[]; kinds?: Kind[] } & Record<
  string,
  unknown
>;

const FACTORIES: Record<string, (e: Entry) => Adapter> = {
  local: (e) => createLocalAdapter(e.name),
  jira: (e) => {
    for (const k of ['site', 'project', 'email', 'token'])
      if (!e[k]) throw new Error(`a jira adapter needs "${k}"`);
    return createJiraAdapter(e as unknown as JiraConfig);
  },
};

/** The routes `adapters.json` lists, or the local adapter alone when there is no such file. */
export function loadRoutes(path = adaptersPath()): Route[] {
  if (!existsSync(path)) return [{ adapter: createLocalAdapter() }];
  const { adapters } = JSON.parse(readFileSync(path, 'utf8')) as { adapters?: Entry[] };
  if (!Array.isArray(adapters)) throw new Error(`${path}: expected { "adapters": [...] }`);
  const names = new Set<string>();
  return adapters.map((e, i) => {
    const make = FACTORIES[e.kind];
    if (!make)
      throw new Error(
        `${path}: adapters[${i}] has kind "${e.kind}"; known: ${Object.keys(FACTORIES).join(', ')}`,
      );
    if (e.kinds?.some((k) => !KINDS.includes(k)))
      throw new Error(`${path}: adapters[${i}].kinds takes ${KINDS.join(', ')}`);
    const adapter = make(e);
    if (names.has(adapter.name))
      throw new Error(`${path}: two adapters named "${adapter.name}"; give one a "name"`);
    names.add(adapter.name);
    return { adapter, repos: e.repos, kinds: e.kinds };
  });
}
