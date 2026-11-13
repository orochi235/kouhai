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
- **Don't keep a question that was seen and won't outlive the session.** A question can be settled
  with no inbox entry when both hold: the next prompt responds to the answer, so it was seen; and
  the answer is about something that won't last past the session, like a label on a page made for
  this task. An answer given after attention moved on still gets filed, which is the point of the
  inbox. Neither is known when the question is filed, so this is a settle on the next prompt, with
  Claude judging the second condition. Closes when such a question leaves nothing unread. Raised
  2026-11-13 over "what do those 'read' badges mean?" on a weasel audit page.
- **The old `ask` and `answer` tools still load and fail.** In a weasel session on 2026-11-13 the
  hook asked for `take`, but a tool search for it surfaced only `ask` and `answer`, and `ask` failed
  with "no such table: questions". Closes when only the current tools are exposed, or the old ones
  forward to `take` and `settle`.
