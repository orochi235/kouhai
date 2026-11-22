# kouhai

A ledger of what Claude Code sessions owe you: the direct questions you ask them mid-task, and
the instructions they haven't carried out yet. Each item lands in a local page with the repo,
the session, and the prompt it came from, and stays **owed** until the agent settles it.
Claude still answers in chat as usual.

| Kind            | Filed when                                                                                                         | Settles as                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| question `q-17` | you ask Claude something directly                                                                                  | answered, dropped, deferred |
| task `t-18`     | you give an instruction Claude won't finish this turn: queued behind other work, meant for later, or sent mid-turn | done, dropped, deferred     |

An instruction carried out in the same turn isn't filed; brainhouse already keeps the whole
transcript. _Deferred_ means moved to another durable home (a TODO entry, an issue), and the note
says where. Work still waiting on a later turn stays owed.

## How an item gets there

| Step           | Piece                      | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt sent    | `UserPromptSubmit` hook    | Opens a _turn_ holding the prompt's context and tells Claude the filing rule and the turn id. Messages sent mid-turn get this hook too. If the session's tools lack `take` (a server older than the rule, or one that failed to connect), it says so once, as `kouhai ✗`.                                                                                                                                                                                                                                                                                                                                                        |
| Claude files   | MCP tool `take`            | Claude files each question, and each task it won't finish now, with a slug of a few words, getting back `q-17 #cost-of-slugs`. Either name works anywhere after, and a `#slug` in a prompt cites the item like `[q-17]`. A question that follows up on an answer Claude gave last turn names it as `parent`; the page nests it under that answer.                                                                                                                                                                                                                                                                                |
| Claude settles | MCP tool `settle`          | An outcome and a markdown note written to stand alone, linking every file, commit, and issue it names, plus optional attachments (an artifact URL, a file, a link, a transom render). Optional fields: a one-sentence `verdict` (the list row shows it instead of the note), a `basis` (`measured`, `read`, or `inferred`), and a `scope` (`session` for an answer of no use once the session ends; `durable` by default). The ledger records the repo's commit and the files the note links, and flags the answer when one of those files has changed since. Settling again replaces the note and marks it unread.              |
| You ask /btw   | prompt history             | `/btw` runs no hook and reaches no transcript, so its answer is lost; the question is kept only in `<config dir>/history.jsonl`. The daemon (every minute) and the prompt, stop, and session-start hooks file each new one as a question owed by its session, marked `/btw`, and put it to that session once: on its next prompt, or by holding its current turn open. If that session goes quiet for 30 minutes first, the next session to start in the repo answers it. Nothing older than the first look is filed.                                                                                                            |
| You ask aside  | `kouhai-aside` mod         | `/btw` and `/ask <question>` run mid-turn without interrupting: the mod forks the live session with `$.model.fork` (one tool-less question over the transcript, served from the session's own prompt cache), and files the answer through `kouhai aside`, with the fork's token counts in `usage`. `/btw` shows the answer in a pane that Escape closes, which the main agent never reads; `/ask` prints it as a line in the conversation, which the agent does read. Each fork is shown the session's last three side questions and answers, so a follow-up works. If the fork can't answer, `/btw` falls back to the built-in. |
| Turn ends      | `Stop` hook                | Silent unless something is unfiled: it holds the turn open once for a message sent mid-turn that no prompt hook delivered, found in the transcript. Owed items are already in the ledger, so it leaves them alone.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Subagent ends  | `SubagentStop` hook        | Holds a subagent open once if it left items it filed owed: it settles them or names them in its report, so the agent that started it carries them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Next session   | `SessionStart` hook        | Owed and unread items from this repo get mentioned in one line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Session ends   | `SessionEnd` hook          | Archives what the session settled with `session` scope. The daemon does the same hourly for sessions with no turn in 12 hours, since a killed terminal never runs the hook.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| You read it    | `localhost:8771`, menu bar | The ledger by repo, with unread and owed counts in the menu bar. The Claude status line (in chezmoi's `claude-statusline.sh`) shows `⧗` for what the session owes and `✉` for the repo's unread answers.                                                                                                                                                                                                                                                                                                                                                                                                                         |

The MCP server Claude Code keeps running is only a relay: each request runs in a fresh process, so
a session started before a change still gets the current tools, and is told when they change.

Start a prompt with `??`, or put `(??)` anywhere in it, to have its question filed whatever the
rule says, for instance a "what's next?" you want a lasting answer to; the rule otherwise skips those.

Each stage says what it did in the transcript: the hooks print a `kouhai ▸` line, Claude says
what it filed, and Claude ends an answer in chat with `[q-17]`, linked to the item while the ledger UI runs. `owed` lets Claude list
its own open items after a long stretch of work or a compaction.

To point Claude at an item, cite it in brackets in a prompt: `[q-17]`, or the `[[q-17](…)]` an answer ends with.
The prompt hook brings in that item's question and answer, up to ten per prompt and 6,000 characters per answer
(the `show` tool returns the rest), and each answer once per session until it is settled again. A bare `q-17` comes in only if Claude takes it for an item and reads it with the `show`
tool; an id inside a longer token, such as `faq-17`, is never matched.

On the page: `j`/`k` move, `1`/`2` Questions/Tasks, `x` or delete archive, `u` toggle unread, `p` pin,
`m` misfiled, `c` copies the item's citation (`[q-17]`, or every selected item's), `/` search; click, Cmd-click, and Shift-click select rows, Shift+`j`/`k` extend the
selection, Mod+A selects every row and Esc clears it, and `x`, `u`, and `p` act on the whole selection; Mod+Z and Shift+Mod+Z undo and redo any of those (and tag edits and Mark all read);
Shift+/ lists every key, and Mod+, opens preferences (the inbox it opens on,
and whether opening an item marks it read). The columns are windease panes: drag a seam to resize.
**Misfiled** marks an item that should never have been filed, with an optional reason, and
archives it; the five latest go into the MCP server's instructions as examples of what not to
file, so a new session learns from them (`kouhai misfile <id> [why]` does the same).
**Tags** are your own labels: add one from an item's reader (a new name defines it), filter by it
from the sidebar, and rename, recolor, or delete it there. Claude never sets them. Opening a settled
item marks it read; under Unread it stays listed until you move off it. `?q=q-17` opens one directly.
An item a note names (`q-17`, `#cost-of-slugs`) is a link that opens it. Notes render as GitHub-flavored markdown: a code
block that names its language is highlighted (highlight.js), and a ` ```mermaid ` block draws its diagram. A file a note links to opens when clicked; the
daemon opens only absolute paths that note itself links. An attached image, and a local image the
note shows with `![](/abs/path.png)`, appear inline. A claude.ai artifact stays a link, since
claude.ai refuses to be framed (`frame-ancestors 'self'`).

## Layers

| Layer    | Where          | Job                                                                             |
| -------- | -------------- | ------------------------------------------------------------------------------- |
| engine   | `src/engine`   | the ledger: items, turns, the store, repo summaries                             |
| capture  | `src/capture`  | the Claude Code side: hooks and the MCP server, writing the store directly      |
| adapters | `src/adapters` | systems items are mirrored to as they are filed and settled, such as Jira       |
| server   | `src/server`   | the HTTP API, a server-sent event stream, outlet mounting, and the outbox drain |
| outlets  | `outlets/*`    | ways of showing the ledger: `web` (the page at `/`) and `menubar`               |

An outlet is a module exporting an `Outlet` (`src/server/outlet.ts`), added to the list in
`src/cli.ts`. It can serve built files at a mount point and add routes under
`/outlets/<name>/`, which get read-only ledger queries; anything else it needs comes from the
API. A browser outlet such as a stream overlay needs only the API:

| Endpoint                                                       | Gives                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/items?filter=owed&kind=task&repo=&tag=&text=&limit=` | items, counts, per-repo summaries, and tags                           |
| `GET /api/item?id=t-18`                                        | one item                                                              |
| `GET /api/stale?id=q-17`                                       | `{ changed }`: files the note cites that changed since it was settled |
| `GET /api/events`                                              | a server-sent `change` event, with the new version, on every change   |
| `GET /api/image?id=q-17&path=`                                 | an image the item attached or its note links, and no other            |
| `POST /api/read`, `/api/archive`, `/api/pin`, `/api/read-all`  | `{ id, read \| archived \| pinned }`                                  |
| `POST /api/misfile`                                            | `{ id, misfiled, why }`                                               |
| `POST /api/tag`                                                | `{ id, tag, on }`; setting an unknown tag defines it                  |
| `POST /api/tags`                                               | `{ action: rename \| color \| delete, name, to, color }`              |
| `GET /api/settings`, `POST /api/settings`                      | the ledger's settings; `POST` takes any subset, such as `{ refs }`    |
| `GET /api/outbox`                                              | adapter events not yet delivered, with their attempts and last error  |

## Refs

Each item's number is written by a template per kind, the `refs` setting, `q-{n}` and `t-{n}` by
default. Change it with `POST /api/settings` and `{ "refs": { "question": "KQ-{n}", "task": "K-{n}" } }`:
every item, old ones too, then shows under the new form. The default forms keep working wherever
a ref is read (a prompt, a note, the CLI, a link), so nothing written before the change breaks. A
template holds `{n}` once, among letters, digits, `.`, `_` and `-`. Numbering is one counter
shared by every repo and both kinds.

## Adapters

An adapter mirrors the ledger into another system: it hears about each item as it is filed and
as it is settled, and can record where it keeps the item there, which the page shows as a link.
SQLite stays the record of what is owed. Capture writes each event to an outbox beside the item,
and the daemon hands it to the adapters every few seconds, retrying a failure with backoff (30 s,
doubling, up to 6 h) and giving up after 10 attempts; `GET /api/outbox` shows what is waiting.

`~/.kouhai/adapters.json` lists them; with no file there is only `local`, which records nothing.
Each entry can be narrowed to some `repos` and `kinds`. The daemon reads the file when it starts,
and holds events (losing none) while the file doesn't parse.

```json
{
  "adapters": [
    {
      "kind": "jira",
      "site": "https://example.atlassian.net",
      "project": "KOU",
      "email": "you@example.com",
      "token": { "command": "security find-generic-password -s jira-token -w" },
      "repos": ["x-helm"],
      "kinds": ["task"]
    }
  ]
}
```

| Kind    | Filed                                                                                             | Settled                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `local` | nothing                                                                                           | nothing                                                                                                                                                                                                                                          |
| `jira`  | an issue (`issueType`, `Task` by default) in `project`, labeled `kouhai` and with the item's tags | a comment holding the note, then a move by `transitions` (outcome to transition or status name; `done` and `answered` go to `Done`, `dropped` to `Won't Do`; a workflow without the status keeps the issue where it is, and the comment says so) |

A Jira `token` is `{ "env": "NAME" }` or `{ "command": "..." }`, read when the first request goes
out. A new adapter is a module exporting a factory for the `Adapter` interface in
`src/adapters/adapter.ts`, added to `FACTORIES` in `src/adapters/config.ts`.

## Install

```sh
brew install orochi235/tap/kouhai
brew services start kouhai        # the daemon, on :8771
claude plugin marketplace add orochi235/kouhai
claude plugin install kouhai@kouhai
```

From a checkout instead, which is how it is developed (a change to `src/` reaches hooks at once):

```sh
npm install && npm run build      # the page
npm run service:install           # LaunchAgent dev.kouhai on :8771, and `kouhai` on PATH
npm run menubar:install           # the menu bar item (perch)
claude plugin marketplace add ~/src/kouhai
claude plugin install kouhai@kouhai
```

Run the last two once per Claude config directory (`CLAUDE_CONFIG_DIR=~/.claude-pw claude plugin …`).
Every harness writes to the same ledger; each item carries the harness it came from.
On a machine where `kouhai` isn't on PATH, the plugin's hooks do nothing and its MCP server is an empty
stand-in that says how to install, so sessions start without errors.

## CLI

```
kouhai ls [inbox|owed|unread|pinned|archived|all] [questions|tasks] [--tag later]
kouhai tag q-17 later [--undo]
kouhai tags
kouhai show t-18
kouhai read q-17
kouhai open [q-17]
kouhai prune
```

## Storage

`~/.kouhai/inbox.db`, SQLite in WAL mode, readable only by you. Attachments are stored as
references, never copies. An archived item is deleted 180 days after it was archived, unless
pinned. Turns and the record of chased mid-turn messages are deleted after two days. The daemon
prunes on start and daily; `kouhai prune` does it now. An adapter event leaves the outbox once
delivered; one given up on is deleted 30 days later. The daemon logs to `~/.kouhai/daemon.log`.

`scripts/fixed-cost.ts` prints what kouhai adds to every request (its instructions and tool
schemas) and to each turn; `scripts/token-cost.mjs <transcript>... --fixed $(scripts/fixed-cost.ts --chars)`
measures a session's share. Run both before and after a change to anything an agent reads.
