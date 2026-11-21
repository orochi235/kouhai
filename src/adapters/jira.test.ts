import { describe, expect, it } from 'vitest';
import type { Item } from '../engine/types.ts';
import { adfOf } from './adf.ts';
import { createJiraAdapter } from './jira.ts';

type Call = { method: string; path: string; body: unknown; auth: string | null };

/** A Jira that answers from `replies` by `METHOD /path`, recording each call. */
function fakeJira(replies: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://x.atlassian.net/rest/api/3', '');
    const method = init.method ?? 'GET';
    const headers = init.headers as Record<string, string>;
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(String(init.body)) : null,
      auth: headers.authorization ?? null,
    });
    const key = `${method} ${path}`;
    if (!(key in replies)) return new Response('{"errorMessages":["nope"]}', { status: 404 });
    return new Response(JSON.stringify(replies[key] ?? ''), { status: 200 });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const item = (over: Partial<Item> = {}) =>
  ({
    id: 4,
    ref: 't-4',
    kind: 'task',
    text: 'put the captions in the zip',
    repo: 'transom',
    tags: ['later on'],
    outcome: null,
    note: null,
    verdict: null,
    ...over,
  }) as Item;

const config = {
  site: 'https://x.atlassian.net/',
  project: 'KOU',
  email: 'me@example.com',
  token: { env: 'UNUSED' },
};
const secret = () => 'tok';

describe('the Jira adapter', () => {
  it('files an item as an issue in the project, with basic auth', async () => {
    const jira = fakeJira({ 'POST /issue': { key: 'KOU-12' } });
    const a = createJiraAdapter(config, { fetch: jira.fetch, secret });
    expect(await a.file(item())).toEqual({
      key: 'KOU-12',
      url: 'https://x.atlassian.net/browse/KOU-12',
    });
    const [c] = jira.calls;
    expect(c?.auth).toBe(`Basic ${Buffer.from('me@example.com:tok').toString('base64')}`);
    expect(c?.body).toMatchObject({
      fields: {
        project: { key: 'KOU' },
        issuetype: { name: 'Task' },
        summary: 'put the captions in the zip',
        labels: ['kouhai', 'later-on'],
      },
    });
  });

  it('comments the settlement, then moves the issue by the outcome', async () => {
    const jira = fakeJira({
      'GET /issue/KOU-12/transitions': {
        transitions: [
          { id: '11', name: 'Start' },
          { id: '31', name: 'Finish', to: { name: 'Done' } },
        ],
      },
      'POST /issue/KOU-12/comment': {},
      'POST /issue/KOU-12/transitions': null,
    });
    const a = createJiraAdapter(config, { fetch: jira.fetch, secret });
    await a.settle(item({ outcome: 'done', note: 'Landed in `abc`.' }), {
      key: 'KOU-12',
      url: null,
    });
    expect(jira.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /issue/KOU-12/transitions',
      'POST /issue/KOU-12/comment',
      'POST /issue/KOU-12/transitions',
    ]);
    expect(jira.calls[2]?.body).toEqual({ transition: { id: '31' } });
  });

  it('comments without moving an issue already in the target status', async () => {
    const jira = fakeJira({
      'GET /issue/KOU-12/transitions': { transitions: [] },
      'GET /issue/KOU-12?fields=status': { fields: { status: { name: 'done' } } },
      'POST /issue/KOU-12/comment': {},
    });
    const a = createJiraAdapter(config, { fetch: jira.fetch, secret });
    await a.settle(item({ outcome: 'done', note: 'again' }), { key: 'KOU-12', url: null });
    expect(jira.calls.at(-1)?.path).toBe('/issue/KOU-12/comment');
  });

  it('throws before commenting when no transition reaches the target, so a retry is clean', async () => {
    const jira = fakeJira({
      'GET /issue/KOU-12/transitions': { transitions: [{ id: '11', name: 'Start' }] },
      'GET /issue/KOU-12?fields=status': { fields: { status: { name: 'To Do' } } },
    });
    const a = createJiraAdapter(config, { fetch: jira.fetch, secret });
    await expect(
      a.settle(item({ outcome: 'dropped', note: 'no' }), { key: 'KOU-12', url: null }),
    ).rejects.toThrow(/no transition to "Won't Do"/);
    expect(jira.calls.some((c) => c.path.endsWith('/comment'))).toBe(false);
  });

  it('waits for the issue before settling, and surfaces Jira errors', async () => {
    const a = createJiraAdapter(config, { fetch: fakeJira({}).fetch, secret });
    await expect(a.settle(item({ outcome: 'done' }), null)).rejects.toThrow(/no issue yet/);
    await expect(a.file(item())).rejects.toThrow(/Jira 404 on POST \/issue/);
  });
});

describe('adfOf', () => {
  it('keeps paragraphs, code blocks, inline code, bold and links', () => {
    const doc = adfOf('**Yes**, see `x` and [docs](https://d).\n\n```sh\nls\n```\nafter');
    expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'codeBlock', 'paragraph']);
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Yes', marks: [{ type: 'strong' }] },
        { type: 'text', text: ', see ' },
        { type: 'text', text: 'x', marks: [{ type: 'code' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://d' } }] },
        { type: 'text', text: '.' },
      ],
    });
    expect(doc.content[1]).toEqual({
      type: 'codeBlock',
      attrs: { language: 'sh' },
      content: [{ type: 'text', text: 'ls' }],
    });
  });
});
