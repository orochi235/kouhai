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
