# dixeram

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

| Step           | Piece                      | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt sent    | `UserPromptSubmit` hook    | Opens a _turn_ holding the prompt's context and tells Claude the filing rule and the turn id. Messages sent mid-turn get this hook too. If the session's tools lack `take` (a server older than the rule, or one that failed to connect), it says so once, as `dixeram ✗`.                                                                                                                                                                                                                                                                                                                                          |
| Claude files   | MCP tool `take`            | Claude files each question, and each task it won't finish now, with a slug of a few words, getting back `q-17 #cost-of-slugs`. Either name works anywhere after, and a `#slug` in a prompt cites the item like `[q-17]`. A question that follows up on an answer Claude gave last turn names it as `parent`; the page nests it under that answer.                                                                                                                                                                                                                                                                   |
| Claude settles | MCP tool `settle`          | An outcome and a markdown note written to stand alone, linking every file, commit, and issue it names, plus optional attachments (an artifact URL, a file, a link, a transom render). Optional fields: a one-sentence `verdict` (the list row shows it instead of the note), a `basis` (`measured`, `read`, or `inferred`), and a `scope` (`session` for an answer of no use once the session ends; `durable` by default). The ledger records the repo's commit and the files the note links, and flags the answer when one of those files has changed since. Settling again replaces the note and marks it unread. |
| You ask /btw   | prompt history             | `/btw` runs no hook and reaches no transcript, so its answer is lost; the question is kept only in `<config dir>/history.jsonl`. The daemon (every minute) and the prompt, stop, and session-start hooks file each new one as a question owed by its session, marked `/btw`, and put it to that session once: on its next prompt, or by holding its current turn open. If that session goes quiet for 30 minutes first, the next session to start in the repo answers it. Nothing older than the first look is filed.                                                                                               |
| You ask aside  | `dixeram-aside` mod        | `/ask <question>`, and `/btw` once the mod catches it, run mid-turn without interrupting: the mod forks the live session with `$.model.fork` (one tool-less question over the transcript, served from the session's own prompt cache), prints the answer as a line in the conversation, and files it answered through `dixeram aside`, with the fork's token counts in `usage`. If the fork can't answer, `/btw` falls back to the built-in.                                                                                                                                                                        |
| Turn ends      | `Stop` hook                | Silent unless something is unfiled: it holds the turn open once for a message sent mid-turn that no prompt hook delivered, found in the transcript. Owed items are already in the ledger, so it leaves them alone.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Subagent ends  | `SubagentStop` hook        | Holds a subagent open once if it left items it filed owed: it settles them or names them in its report, so the agent that started it carries them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Next session   | `SessionStart` hook        | Owed and unread items from this repo get mentioned in one line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Session ends   | `SessionEnd` hook          | Archives what the session settled with `session` scope. The daemon does the same hourly for sessions with no turn in 12 hours, since a killed terminal never runs the hook.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| You read it    | `localhost:8771`, menu bar | The ledger by repo, with unread and owed counts in the menu bar. The Claude status line (in chezmoi's `claude-statusline.sh`) shows `⧗` for what the session owes and `✉` for the repo's unread answers.                                                                                                                                                                                                                                                                                                                                                                                                            |

The MCP server Claude Code keeps running is only a relay: each request runs in a fresh process, so
a session started before a change still gets the current tools, and is told when they change.

Start a prompt with `??`, or put `(??)` anywhere in it, to have its question filed whatever the
rule says, for instance a "what's next?" you want a lasting answer to; the rule otherwise skips those.

Each stage says what it did in the transcript: the hooks print a `dixeram ▸` line, Claude says
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
file, so a new session learns from them (`dixeram misfile <id> [why]` does the same).
**Tags** are your own labels: add one from an item's reader (a new name defines it), filter by it
from the sidebar, and rename, recolor, or delete it there. Claude never sets them. Opening a settled
item marks it read; under Unread it stays listed until you move off it. `?q=q-17` opens one directly.
An item a note names (`q-17`, `#cost-of-slugs`) is a link that opens it. Notes render as GitHub-flavored markdown: a code
block that names its language is highlighted (highlight.js), and a ` ```mermaid ` block draws its diagram. A file a note links to opens when clicked; the
daemon opens only absolute paths that note itself links. An attached image, and a local image the
note shows with `![](/abs/path.png)`, appear inline. A claude.ai artifact stays a link, since
claude.ai refuses to be framed (`frame-ancestors 'self'`).

## Layers

| Layer   | Where         | Job                                                                        |
| ------- | ------------- | -------------------------------------------------------------------------- |
| engine  | `src/engine`  | the ledger: items, turns, the store, repo summaries                        |
| capture | `src/capture` | the Claude Code side: hooks and the MCP server, writing the store directly |
| server  | `src/server`  | the HTTP API, a server-sent event stream, and outlet mounting              |
| outlets | `outlets/*`   | ways of showing the ledger: `web` (the page at `/`) and `menubar`          |

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

## Install

```sh
npm install && npm run build      # the page
npm run service:install           # LaunchAgent dev.dixeram on :8771, and `dixeram` on PATH
npm run menubar:install           # the menu bar item (perch)
claude plugin marketplace add ~/src/dixeram
claude plugin install dixeram@dixeram
```

Run the last two once per Claude config directory (`CLAUDE_CONFIG_DIR=~/.claude-pw claude plugin …`).
Every harness writes to the same ledger; each item carries the harness it came from.
On a machine where `dixeram` isn't on PATH, the plugin's hooks do nothing and its MCP server is an empty
stand-in that says how to install, so sessions start without errors.

## CLI

```
dixeram ls [inbox|owed|unread|pinned|archived|all] [questions|tasks] [--tag later]
dixeram tag q-17 later [--undo]
dixeram tags
dixeram show t-18
dixeram read q-17
dixeram open [q-17]
dixeram prune
```

## Storage

`~/.dixeram/inbox.db`, SQLite in WAL mode, readable only by you. Attachments are stored as
references, never copies. An archived item is deleted 180 days after it was archived, unless
pinned. Turns and the record of chased mid-turn messages are deleted after two days. The daemon
prunes on start and daily; `dixeram prune` does it now. The daemon logs to `~/.dixeram/daemon.log`.

`scripts/fixed-cost.ts` prints what dixeram adds to every request (its instructions and tool
schemas) and to each turn; `scripts/token-cost.mjs <transcript>... --fixed $(scripts/fixed-cost.ts --chars)`
measures a session's share. Run both before and after a change to anything an agent reads.
