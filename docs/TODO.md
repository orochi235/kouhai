# dixeram — open work

- **Listen to debates and find the questions nobody answers.** Turn it on during a debate or a
  meeting: transcribe the audio, attribute each line to a speaker (diarization), file every
  question one speaker puts to another as an item owed by the one asked, and settle it when an
  answer comes, or leave it owed when the subject changes. The ledger's model already fits
  (an item, who owes it, an outcome); what's new is the capture side: audio, speech to text,
  speaker attribution, and judging whether a reply answers the question. Asked for 2026-11-13.

- **Make capture-source identity part of the ledger contract before adding a second client.** Capture
  and transcript reading are Claude-specific. Before Codex or ChatGPT support, give sessions, turns, and
  items source-qualified identity and idempotency keys, rather than having another parser imitate
  Claude's records; test with mixed-source fixtures whose unqualified session ids collide. The full
  adapter plan, unbuilt, is [CHATGPT-SUPPORT.md](../CHATGPT-SUPPORT.md). From the 2026-11-14 review.

- **Delete the tint lab once the tint has settled.** The tint was chosen 2026-11-17: the project's
  `.hued` background at 10% in light and 17% in dark, defined once in `repoSheet`
  (`outlets/web/src/repoColors.ts`) and used by the reader and the list rows. `outlets/web/lab/`
  (served at `:8771/lab.html`) is kept while it is still being tuned; removing it means `lab/`,
  `lab.html`, the `lab` build input in `vite.config.ts`, and the `@weasel-js/labkit` dependency.

- **Copy transom images a note links to, not only its attachments.** `keep` in
  `src/engine/enclosures.ts` copies an attached transom file or wall URL into `~/.dixeram/enclosures/`,
  but a note's markdown image pointing into `~/transom` or at `localhost:8787/to/…` still breaks
  once the wall clears it. Found 2026-11-17, when two older items' attached shots were already gone.

- **Rename away from a name that reads as "dicks".** Favorite so far: *kouhai* (the junior who keeps
  track for the senior); runners-up *slate* and *chit*. Left for later (2026-11-16). The rename
  touches the plugin and marketplace names, the `dev.dixeram` launchd label, `DIXERAM_HOME` and
  `DIXERAM_PORT`, the `~/.local/bin` link, and every MCP tool prefix.
