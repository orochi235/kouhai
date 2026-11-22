import { execFileSync } from 'node:child_process';
import type { Item, Outcome } from '../engine/types.ts';
import type { Adapter, Recorded } from './adapter.ts';
import { adfOf, plainOf } from './adf.ts';

/** A secret read from an environment variable, or printed by a shell command (a keychain lookup). */
export type Secret = { env: string } | { command: string };

export type JiraConfig = {
  name?: string;
  /** `https://example.atlassian.net` */
  site: string;
  /** The project key issues are created in, such as `KOU`. */
  project: string;
  /** The Atlassian account the token belongs to. */
  email: string;
  token: Secret;
  /** Defaults to `Task`. */
  issueType?: string;
  /** The transition (or status) each outcome moves an issue to; an outcome left out moves nothing. */
  transitions?: Partial<Record<Outcome, string>>;
};

const TRANSITIONS: Partial<Record<Outcome, string>> = {
  answered: 'Done',
  done: 'Done',
  dropped: "Won't Do",
};

export function readSecret(s: Secret): string {
  const v =
    'env' in s
      ? process.env[s.env]
      : execFileSync('/bin/sh', ['-c', s.command], { encoding: 'utf8' });
  if (!v?.trim()) throw new Error(`no secret from ${'env' in s ? `$${s.env}` : s.command}`);
  return v.trim();
}

type Fetch = typeof fetch;

/** Files each item as an issue, then comments its settlement and moves it to the outcome's status. */
export function createJiraAdapter(
  config: JiraConfig,
  deps: { fetch?: Fetch; secret?: (s: Secret) => string } = {},
): Adapter {
  const get = deps.fetch ?? fetch;
  const site = config.site.replace(/\/$/, '');
  const transitions = { ...TRANSITIONS, ...config.transitions };
  let auth: string | null = null;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    auth ??= Buffer.from(`${config.email}:${(deps.secret ?? readSecret)(config.token)}`).toString(
      'base64',
    );
    const res = await get(`${site}/rest/api/3${path}`, {
      method,
      headers: {
        authorization: `Basic ${auth}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Jira ${res.status} on ${method} ${path}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * The transition to `target`; null when the issue already sits there, or a reason when no
   * transition reaches it from where it is.
   */
  async function transitionTo(
    key: string,
    target: string,
  ): Promise<string | null | { missing: string }> {
    const same = (s: string | undefined) => s?.toLowerCase() === target.toLowerCase();
    const { transitions: open } = await call<{
      transitions: { id: string; name: string; to?: { name?: string } }[];
    }>('GET', `/issue/${key}/transitions`);
    const t = open.find((t) => same(t.name) || same(t.to?.name));
    if (t) return t.id;
    const issue = await call<{ fields: { status: { name: string } } }>(
      'GET',
      `/issue/${key}?fields=status`,
    );
    if (same(issue.fields.status.name)) return null;
    return { missing: `no transition to "${target}" from "${issue.fields.status.name}"` };
  }

  return {
    name: config.name ?? 'jira',

    async file(item: Item): Promise<Recorded> {
      const where = item.repo ? ` in ${item.repo}` : '';
      const { key } = await call<{ key: string }>('POST', '/issue', {
        fields: {
          project: { key: config.project },
          issuetype: { name: config.issueType ?? 'Task' },
          summary: plainOf(item.text).slice(0, 255),
          description: adfOf(`${item.text}\n\nFiled by kouhai as \`${item.ref}\`${where}.`),
          labels: ['kouhai', ...item.tags.map((t) => t.replace(/\s+/g, '-'))],
        },
      });
      return { key, url: `${site}/browse/${key}` };
    },

    async settle(item: Item, at: Recorded | null): Promise<void> {
      if (!at) throw new Error(`${item.ref} has no issue yet`);
      // A workflow without the outcome's status still gets the comment, saying it wasn't moved.
      const target = item.outcome ? transitions[item.outcome] : undefined;
      const to = target ? await transitionTo(at.key, target) : null;
      const verdict = item.verdict ? `**${item.verdict}**\n\n` : '';
      const stuck =
        to && typeof to === 'object' ? `\n\n_kouhai left the status alone: ${to.missing}._` : '';
      await call('POST', `/issue/${at.key}/comment`, {
        body: adfOf(`${item.outcome}: ${verdict}${item.note ?? ''}${stuck}`),
      });
      if (typeof to === 'string')
        await call('POST', `/issue/${at.key}/transitions`, { transition: { id: to } });
    },
  };
}
