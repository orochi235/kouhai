# dixeram

An inbox for the questions you ask Claude Code in the middle of other work. When a prompt asks
Claude something directly, the question and Claude's answer land in a local inbox page, with
the repo, the session, and the prompt they came from. Claude still answers in chat as usual.

## How a question gets there

| Step           | Piece                      | What happens                                                                                                                                                          |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt sent    | `UserPromptSubmit` hook    | A loose check (a `?`, a what/why/how…, or a leading `??` to force it) opens a _turn_ holding the prompt's context and tells Claude its id.                            |
| Claude decides | MCP tool `ask`             | Claude records each real question, not requests worded as one, and gets back `q-17`.                                                                                  |
| Claude answers | MCP tool `answer`          | Markdown written to stand alone, plus optional attachments: an artifact URL, a file, a link, a transom render. Answering again replaces the text and marks it unread. |
| Turn ends      | `Stop` hook                | If a question from this session has no answer, the turn is held open once with "answer q-17 before stopping".                                                         |
| Next session   | `SessionStart` hook        | Unread answers from this repo get mentioned in one line.                                                                                                              |
| You read it    | `localhost:8771`, menu bar | An inbox grouped by repo, with an unread count in the menu bar.                                                                                                       |

Each stage says what it did in the transcript. The hooks print a `dixeram ▸` line, Claude says
which ids it filed, and Claude ends each answer in chat with `(q-17 → inbox)`.

Keys on the page: `j`/`k` move, `e` archive, `u` toggle unread, `p` pin, `/` search. Opening an
answer marks it read. `?q=q-17` opens one directly.

## Install

```sh
npm install && npm run build      # the inbox page
npm run service:install           # LaunchAgent dev.dixeram on :8771, and `dixeram` on PATH
npm run menubar:install           # the menu bar item (perch)
claude plugin marketplace add ~/src/dixeram
claude plugin install dixeram@dixeram
```

Run the last two once per Claude config directory (`CLAUDE_CONFIG_DIR=~/.claude-pw claude plugin …`).
Every harness writes to the same inbox; each answer carries the harness it came from.

## CLI

```
dixeram ls [inbox|unread|waiting|pinned|archived|all]
dixeram show q-17
dixeram read q-17
dixeram open [q-17]
dixeram prune
```

## Storage

`~/.dixeram/inbox.db`, SQLite in WAL mode, readable only by you. Attachments are stored as
references, never copies. An archived answer is deleted 180 days after it was archived, unless
pinned. A turn nobody asked a question from is deleted after two days. The daemon prunes on
start and daily; `dixeram prune` does it now. The daemon logs to `~/.dixeram/daemon.log`.
