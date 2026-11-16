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

- **Pick the reader's project tint, then delete the tint lab.** The reader pane is washed in its
  project's `.hued` background at 7% (`outlets/web/src/components/Reader.css`), a first attempt; it
  vanishes in dark mode for dark project colors. `outlets/web/lab/` (served at `:8771/lab.html`) varies
  the strength, the source color, the surface, the blend, and how dark mode lifts the color, across six
  real projects. Once one is chosen, move it into `Reader.css` and remove `lab/`, `lab.html`, the `lab`
  build input in `vite.config.ts`, and the `@weasel-js/labkit` dependency. Lab built 2026-11-16.
