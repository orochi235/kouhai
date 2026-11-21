# kouhai — open work

- **Try the Jira adapter against a real Jira site.** It landed 2026-11-21 tested only against a fake
  REST server (`src/adapters/jira.test.ts`, and a daemon run against a stand-in on localhost). Point
  `~/.kouhai/adapters.json` at a scratch project, file and settle one task, and check the issue, the
  comment's formatting (`adf.ts` converts only paragraphs, fenced code, inline code, bold and links),
  and the transition names that project's workflow really uses.

- **A shared ledger, with per-repo numbering every collaborator agrees on.** Wanted, put off as more
  than one person's use needs (2026-11-21); the adapter interface is the surface left for it. The
  design talked through then: each user keeps a local SQLite replica; a hub (`kouhai hub`, one
  container with Postgres, self-hosted first) holds accounts, repos, ref counters and shared items;
  items get a ULID as their identity and a readable per-repo ref (`kouhai-41`) from a block of numbers
  the hub leases to each machine, so capture still files offline; GitHub sign-in, with a repo's ledger
  visible to whoever can see the repo; read, pinned, archived and misfiled kept per user; questions
  private and tasks shared by default in a shared repo, set by a committed `.kouhai.json`; prompts,
  transcript paths, `cwd` and token usage never leave the machine; adapters run on the hub, so a team
  gets one Jira issue per item. Using Jira itself as the shared record was ruled out then: every
  filter would become JQL and every hook a network call.

- **Measure what `verdict`, `basis`, and `scope` cost on real sessions.** They landed 2026-11-17 with
  the `clear` tool and its per-turn rule removed. Fixed cost went from 3,258 to 3,986 characters of
  tool schemas (about +180 tokens per request); the dropped rule was about 376 characters, injected
  on 91 of 252 prompts across this repo's transcripts. Around 2026-11-24, run
  `scripts/token-cost.mjs` with `--fixed $(scripts/fixed-cost.ts --chars)` on a week of sessions on
  either side of the change, and check how often agents fill each field, what answering
  /btw questions costs (the request is 287 characters per question, plus the settle; about 0.7 a day
  going by history), and whether `session` scope
  is being judged well (archived answers that are needed later).

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
