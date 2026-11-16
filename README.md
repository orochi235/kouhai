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

| Step           | Piece                      | What happens                                                                                                                                                                                                                                                               |
| -------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt sent    | `UserPromptSubmit` hook    | Opens a _turn_ holding the prompt's context and tells Claude the filing rule and the turn id. Messages sent mid-turn get this hook too. If the session's tools lack `take` (a server older than the rule, or one that failed to connect), it says so once, as `dixeram ✗`. |
| Claude files   | MCP tool `take`            | Claude files each question, and each task it won't finish now, getting back `q-17`, `t-18`. A question that follows up on an answer Claude gave last turn names it as `parent`; the page nests it under that answer.                                                       |
| Claude settles | MCP tool `settle`          | An outcome and a markdown note written to stand alone, linking every file, commit, and issue it names, plus optional attachments (an artifact URL, a file, a link, a transom render). Settling again replaces the note and marks it unread.                                |
| Answer seen    | MCP tool `clear`           | On the next prompt the hook names last turn's answers. When that prompt responds to one and the answer won't outlive the session (a label on a page made for this task), Claude clears it: read and archived, so it never sits unread.                                     |
| Turn ends      | `Stop` hook                | Silent unless something is unfiled: it holds the turn open once for a message sent mid-turn that no prompt hook delivered, found in the transcript. Owed items are already in the ledger, so it leaves them alone.                                                         |
| Subagent ends  | `SubagentStop` hook        | Holds a subagent open once if it left items it filed owed: it settles them or names them in its report, so the agent that started it carries them.                                                                                                                         |
| Next session   | `SessionStart` hook        | Owed and unread items from this repo get mentioned in one line.                                                                                                                                                                                                            |
| You read it    | `localhost:8771`, menu bar | The ledger by repo, with unread and owed counts in the menu bar. The Claude status line (in chezmoi's `claude-statusline.sh`) shows `⧗` for what the session owes and `✉` for the repo's unread answers.                                                                                                                                                                                                           |

The MCP server Claude Code keeps running is only a relay: each request runs in a fresh process, so
a session started before a change still gets the current tools, and is told when they change.

Start a prompt with `??`, or put `(??)` anywhere in it, to have its question filed whatever the
rule says, for instance a "what's next?" you want a lasting answer to; the rule otherwise skips those.

Each stage says what it did in the transcript: the hooks print a `dixeram ▸` line, Claude says
what it filed, and Claude ends an answer in chat with `[q-17]`, linked to the item while the ledger UI runs. `owed` lets Claude list
its own open items after a long stretch of work or a compaction.

On the page: `j`/`k` move, `1`/`2` Questions/Tasks, `x` or delete archive, `u` toggle unread, `p` pin,
`m` misfiled, `/` search; click, Cmd-click, and Shift-click select rows, Shift+`j`/`k` extend the
selection, Mod+A selects every row and Esc clears it, and `x`, `u`, and `p` act on the whole selection; Mod+Z and Shift+Mod+Z undo and redo any of those (and tag edits and Mark all read);
Shift+/ lists every key, and Mod+, opens preferences (the inbox it opens on,
and whether opening an item marks it read). The columns are windease panes: drag a seam to resize.
**Misfiled** marks an item that should never have been filed, with an optional reason, and
archives it; the five latest go into the MCP server's instructions as examples of what not to
file, so a new session learns from them (`dixeram misfile <id> [why]` does the same).
**Tags** are your own labels: add one from an item's reader (a new name defines it), filter by it
from the sidebar, and rename, recolor, or delete it there. Claude never sets them. Opening a settled
item marks it read. `?q=q-17` opens one directly. Notes render as GitHub-flavored markdown: a code
block that names its language is highlighted (highlight.js), and a ```` ```mermaid ```` block draws its diagram. A file a note links to opens when clicked; the
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

| Endpoint                                                      | Gives                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/items?filter=owed&kind=task&repo=&tag=&text=&limit=` | items, counts, per-repo summaries, and tags                        |
| `GET /api/item?id=t-18`                                       | one item                                                            |
| `GET /api/events`                                             | a server-sent `change` event, with the new version, on every change |
| `GET /api/image?id=q-17&path=`                                | an image the item attached or its note links, and no other          |
| `POST /api/read`, `/api/archive`, `/api/pin`, `/api/read-all` | `{ id, read \| archived \| pinned }`                                |
| `POST /api/misfile`                                           | `{ id, misfiled, why }`                                             |
| `POST /api/tag`                                               | `{ id, tag, on }`; setting an unknown tag defines it                |
| `POST /api/tags`                                              | `{ action: rename \| color \| delete, name, to, color }`           |

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
