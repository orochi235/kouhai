// The tools the MCP server offers, as tools/list returns them.
import { ATTACHMENT_KINDS, BASES, KINDS, OUTCOMES, SCOPES } from '../engine/types.ts';

export const ALL_OUTCOMES = [...new Set(Object.values(OUTCOMES).flat())];

const ATTACHMENTS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ATTACHMENT_KINDS },
      ref: { type: 'string', description: 'URL or absolute path.' },
      label: { type: 'string' },
    },
    required: ['kind', 'ref'],
  },
};

/** What a settlement says beyond its note, on `settle` and on a `take` item filed settled. */
const SETTLEMENT = {
  verdict: {
    type: 'string',
    description:
      'The answer in one sentence; shown above the note, so the note need not repeat it.',
  },
  basis: {
    type: 'string',
    enum: BASES,
    description:
      'measured: you ran or measured it; read: from code or docs; inferred: reasoning only.',
  },
  scope: {
    type: 'string',
    enum: SCOPES,
    description:
      'session: of no use once this session ends (a label on a page made for this task, a status check); archived then. Default durable.',
  },
};

export const TOOLS = [
  {
    name: 'take',
    description:
      "File what you owe, quoting or tightly paraphrasing the user. Pass the hook's `turn` id. An " +
      'item you can settle now takes its `outcome` and `note` here instead of a separate `settle`. ' +
      'Returns ids like q-17 #cost-of-slugs.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: KINDS },
              text: { type: 'string' },
              slug: {
                type: 'string',
                description:
                  'Two to five lowercase words naming it, hyphenated, e.g. cost-of-slugs; the user cites it as #cost-of-slugs.',
              },
              parent: {
                type: 'string',
                description:
                  'For a follow-up question: the id of the settled item whose answer it responds to, e.g. q-17.',
              },
              outcome: {
                type: 'string',
                enum: ALL_OUTCOMES,
                description: 'To file it already settled, with `note`.',
              },
              note: { type: 'string', description: 'As for `settle`.' },
              ...SETTLEMENT,
            },
            required: ['kind', 'text'],
          },
        },
        turn: { type: 'string', description: 'The turn id from the kouhai hook.' },
      },
      required: ['items'],
    },
  },
  {
    name: 'settle',
    description:
      'Settle an item: a question as answered, a task as done, either as dropped (say why) or deferred ' +
      '(moved to a durable home such as a TODO entry or an issue; say where). Work waiting on a later ' +
      'turn stays owed. The note is markdown read away from this chat (a code block naming its language is highlighted; ```mermaid draws a diagram), so it stands on its own: an ' +
      'answer leads with the answer; a task says what was done. Link files as markdown links to ' +
      'absolute paths, and commits, PRs, issues, docs, and artifacts by URL. A line saying work landed ' +
      'in a commit starts with ✅ and links it (`https://github.com/<owner>/<repo>/commit/<sha>`, from ' +
      '`git remote get-url origin`; else the short sha in backticks). Settling again replaces the ' +
      'note and marks it unread. `attachments` adds an artifact URL, a file, or a link.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item id or slug, e.g. q-17 or #cost-of-slugs.' },
        outcome: { type: 'string', enum: ALL_OUTCOMES },
        note: { type: 'string' },
        ...SETTLEMENT,
        attachments: ATTACHMENTS,
      },
      required: ['id', 'outcome', 'note'],
    },
  },
  {
    name: 'owed',
    description:
      "List what this session still owes; use it after long work or a compaction, before saying you're done.",
    inputSchema: {
      type: 'object',
      properties: { turn: { type: 'string', description: 'Any turn id from this session.' } },
    },
  },
  {
    name: 'show',
    description:
      'Read items by id or slug, question and answer, when the user mentions one (q-17, t-4, #cost-of-slugs) meaning a kouhai item.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Item ids or slugs, e.g. q-17.',
        },
      },
      required: ['ids'],
    },
  },
];
