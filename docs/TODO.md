# dixeram — open work

- **Listen to debates and find the questions nobody answers.** Turn it on during a debate or a
  meeting: transcribe the audio, attribute each line to a speaker (diarization), file every
  question one speaker puts to another as an item owed by the one asked, and settle it when an
  answer comes, or leave it owed when the subject changes. The ledger's model already fits
  (an item, who owes it, an outcome); what's new is the capture side: audio, speech to text,
  speaker attribution, and judging whether a reply answers the question. Asked for 2026-11-13.
- **Items owed inside a subagent go unchased.** Only the main session's `Stop` hook checks the
  ledger; `SubagentStop` is not hooked. (2026-11-13)
- **Richer notes on the page.** An `artifact` attachment is only a link, and a `transom` or image
  `file` is only a path; the reader could embed the artifact and show images inline, served by the
  daemon from attached paths only. (2026-11-13)
- **Owed and unread counts in the Claude status line.** The menu bar shows them; the status line
  could too, from `sqlite3 ~/.dixeram/inbox.db` so it costs no Node start. (2026-11-13)
- **`take` can hang until Claude Code's 30-minute MCP timeout.** In one weasel session (2026-11-14) all
  three `take` calls hung and failed with "sent no response or progress for 1800s", so nothing that
  session filed reached the ledger. Ruled out the same day: the store (`dixeram ls owed` answers in
  0.2 s), `mcp-call` (a `tools/list` piped to it answers at once), and a stuck child (no `mcp-call`
  process under any of the three live `dixeram mcp` relays). Not yet checked: whether the request
  reaches the relay at all, and what the relay writes back for a `tools/call`. Closes when a `take`
  either answers or fails within seconds.
