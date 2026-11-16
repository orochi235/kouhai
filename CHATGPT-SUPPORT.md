# ChatGPT and Codex support

Implementation plan from the 2026-11-14 review. Nothing described here has been
implemented or installed. Recheck linked product documentation when implementing.

## Scope and order

Dixeram tracks what an agent owes the user; it does not need to become an OpenAI
model client. Reuse the ledger and its `take`, `settle`, `clear`, and `owed` tools.

Ship local Codex support first. Hosted ChatGPT Work is a separate integration,
because it cannot run the same plugin lifecycle hooks.

| Target | Reusable pieces | New work | Capture guarantee |
| --- | --- | --- | --- |
| Local Codex | SQLite ledger, stdio MCP relay, filing rule, outlets | Source identity, hook adapter, packaging, transcript recovery adapter, session reopening | Aim for Claude parity; verify mid-turn delivery and interruption behavior in a real client |
| Hosted ChatGPT Work | Ledger operations and filing semantics | Reachable MCP service, authentication, explicit conversation context, plugin workflow | Tool-driven filing; no equivalent automatic plugin prompt/stop capture |

Keep the existing layering: engine imports no capture or outlet code; capture
writes SQLite directly; outlets own presentation. Local capture must still work
with the daemon stopped and retain its dependency-free `node:sqlite` design.

## 1. Make source identity explicit

Relevant files:

- [src/engine/types.ts](src/engine/types.ts): `Context.harness` currently means a
  Claude configuration profile, not a general client identity.
- [src/engine/context.ts](src/engine/context.ts): `harnessOf` defaults to Claude
  and recognizes Claude transcript paths.
- [src/capture/mcp.ts](src/capture/mcp.ts): the fallback context reads
  `CLAUDE_CODE_SESSION_ID` and `CLAUDE_CONFIG_DIR`.
- [src/engine/store.ts](src/engine/store.ts): stores context and queries sessions.

Separate client identity (Claude Code, local Codex, hosted ChatGPT) from profile
identity (`claude-msb`, for example). Preserve existing rows as Claude data in
any schema migration. Namespace session identity by client so unrelated clients
cannot share session-scoped queries accidentally.

Bind hook-created turns and subsequent MCP calls explicitly. Passing the
Dixeram turn id is already supported; do not assume an MCP server's working
directory or inherited environment identifies the active conversation. Test
simultaneous sessions and worktrees, including a reused MCP connection.

Hosted conversations may have no local repository or transcript. Leave those
fields absent rather than assigning the server's own working directory as the
user's repo. Any explicit context-binding tool must define how a conversation is
created or resumed and how calls avoid crossing conversation boundaries.

## 2. Add a local Codex hook adapter

Relevant files: [src/capture/hooks.ts](src/capture/hooks.ts),
[src/cli.ts](src/cli.ts), and [plugin/hooks/hooks.json](plugin/hooks/hooks.json).

Keep the filing rule in one canonical definition. Extract shared ledger behavior
from client-specific payload normalization, transcript handling, and wording;
do not fork the rule into separate Claude and Codex copies.

Map these documented Codex events:

- `SessionStart`: surface the repo's owed and unread items.
- `UserPromptSubmit`: create a ledger turn and inject its id and filing context.
- `Stop`: perform bounded recovery for messages or obligations the ledger missed.
- `SubagentStop`: settle completed items or carry still-owed ids to the parent.
- Evaluate `Interrupt` and compaction events for preserving context and avoiding
  lost obligations, without treating an interruption as task completion.

Codex exposes `session_id`, `cwd`, and optional `transcript_path`; turn-scoped
events also expose `turn_id`. Its documented prompt injection and stop
continuation shapes resemble the existing hooks, but verify semantics rather
than copying their JSON blindly. In particular, stop continuation creates a new
prompt: prevent duplicate filings, recursive continuation, and treating recovery
instructions as new human questions. Honor the event's continuation guard.

Acceptance: prompts, follow-ups, unfinished work, compaction, interruption,
resumption, and subagent handoff keep correct source/session context and do not
duplicate items. Capture and settlement work with the daemon stopped.

## 3. Isolate transcript-dependent recovery

[src/engine/transcript.ts](src/engine/transcript.ts) recognizes Claude-specific
queued messages, tool-list records, and tool calls. It cannot parse Codex
transcripts unchanged. Place format-specific capture interpretation behind an
adapter rather than teaching the ledger about each client's transcript format.

Prefer documented hook payloads. Codex documents transcript paths as a
convenience, with an unstable file format. If transcript inspection is needed
for mid-turn recovery or tool-availability detection, isolate it, use sanitized
fixtures, and tolerate missing, truncated, or unknown records. Never report
Claude-level recovery guarantees before exercising Codex's actual mid-turn path.

Acceptance: known formats recover missed messages once; unavailable or changed
formats produce an observable limitation without crashing or inventing items.

## 4. Package and test the local integration

Add a Codex-compatible plugin/configuration entry for `dixeram mcp` and the local
hooks. Keep the Claude plugin working. Follow current OpenAI packaging guidance
instead of assuming the Claude manifest is directly installable everywhere.
Document installation, update/reload behavior, supported surfaces, and how to
check that hooks and all four tools are available.

Local Codex supports stdio MCP. This is the documented direct registration
shape, not an installation already performed:

```sh
codex mcp add dixeram -- dixeram mcp
```

MCP registration alone does not install the lifecycle hooks or establish correct
session context. Validate the server's initialization instructions, tool schemas,
error handling, and tool-list updates in the target client.

## 5. Make outlets source-aware

[outlets/web/src/components/Reader.tsx](outlets/web/src/components/Reader.tsx)
currently always produces a `claude --resume` command. Choose reopening behavior
from source metadata: Claude keeps its existing profile behavior, Codex uses its
supported resume mechanism, and hosted ChatGPT uses a conversation link when one
is available. Do not invent a local resume command for hosted items.

Show the source clearly enough to distinguish otherwise similar sessions. Keep
wording and resume-command construction in the outlet, not the engine. Generalize
Claude-specific README, CLI, tool-description, and attachment wording where it
describes a shared capability; preserve genuinely Claude-specific instructions.

Acceptance: old items still reopen correctly; Codex items reopen their own
session; hosted or incomplete context never yields a misleading shell command.

## 6. Add hosted ChatGPT support as a second arc

Hosted ChatGPT needs a reachable MCP endpoint. The existing local REST/SSE API
is not a Streamable HTTP MCP server. Add a separate transport over the shared
ledger operations, preserving the local stdio path.

Decide whether the authoritative ledger remains local behind an authenticated
bridge or lives on a reachable host. If it moves, specify synchronization with
the local inbox before implementing another database. Protect remote tool calls
with authentication and scope them to the intended user's ledger; the existing
local file-opening and image-serving endpoints are not a public MCP API.

Provide explicit conversation context and a plugin workflow for filing, settling,
follow-ups, and checking owed items before finishing. Add MCP tool annotations
that accurately describe reads and writes. Use only conversation identifiers
and links actually supplied by a supported integration; verify their availability
rather than assuming ChatGPT supplies them on every call.

Plugin lifecycle hooks are not supported in cloud-orchestrated ChatGPT Work.
Consequently this integration cannot independently observe every prompt or hold
every turn open as the local plugin does. State that limitation in setup and
usage documentation. A remote tool connection alone does not provide automatic
capture of all ChatGPT conversations.

Acceptance: an authenticated ChatGPT conversation can file and settle an item,
resume checking its own owed work, and display it in the chosen authoritative
inbox without accessing another conversation's or user's context.

## Validation and rollout

Use `DIXERAM_HOME` pointing at a scratch directory, and `DIXERAM_PORT` for any
second daemon. Never seed the real inbox while testing.

1. Add migration and context-isolation tests, preserving existing Claude rows.
2. Add Codex hook fixtures and tests for retries, continuation, interrupts,
   follow-ups, compaction, and subagent handoff.
3. Exercise stdio MCP against a real local Codex session and a scratch store.
4. Test source-specific resume output and missing-context presentation.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
6. Only then install/update the plugin and restart the daemon if needed for the
   actual rollout. A plan or documentation change needs neither operation.

The review baseline was 36 passing tests across capture hooks, MCP, the store,
and transcript parsing. Those validate existing behavior, not Codex support.

## References

- [Codex hooks](https://learn.chatgpt.com/docs/hooks): events, payloads,
  context injection, continuation, and transcript-format limitations.
- [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp): local stdio and
  HTTP connection options.
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins):
  current manifests and supported local packaging.
- [Plugin surface limitations](https://learn.chatgpt.com/docs/plugins):
  lifecycle hooks versus hosted ChatGPT Work.
