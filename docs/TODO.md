# dixeram — open work

- **Questions asked of a subagent go unchased.** Only the main session's `Stop` hook checks for
  unanswered questions; `SubagentStop` is not hooked. (2026-11-13)
- **Richer answers in the page.** An `artifact` attachment is only a link, and a `transom` or
  image `file` is only a path; the reader could embed the artifact and show images inline,
  served by the daemon from attached paths only. (2026-11-13)
- **Unread count in the Claude status line.** The menu bar shows it; the status line could too,
  from `sqlite3 ~/.dixeram/inbox.db` so it costs no Node start. (2026-11-13)
