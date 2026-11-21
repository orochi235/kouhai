import type { Attachment, Basis, Item, Kind, Outcome, Via } from '@core/types.ts';

/** The repos the sample ledger files under, with the colors and symbol each one's `.hued` gives. */
export const HUED: Record<string, { bg: string; fg: string; icon: string }> = {
  kouhai: { bg: '#331300', fg: '#fed8ca', icon: 'questionmark.bubble' },
  transom: { bg: '#b9a281', fg: '', icon: 'photo.stack' },
  perch: { bg: '#eeb48d', fg: '', icon: 'bird' },
  hued: { bg: '#b31077', fg: '', icon: 'swatchpalette' },
  klieg: { bg: '#ffffc4', fg: '#222222', icon: 'light.beacon.max' },
  blits: { bg: '#fa8072', fg: '', icon: 'slider.vertical.3' },
  weasel: { bg: '#470013', fg: '', icon: 'pencil.and.outline' },
};

export const TAGS = [
  { name: 'later', color: '#3f6e8c' },
  { name: 'design', color: '#8a5a9e' },
  { name: 'perf', color: '#b8862b' },
];

const MIN = 60_000;

export type Seed = {
  kind: Kind;
  repo: string;
  text: string;
  slug: string;
  /** Minutes before the page loaded that it was filed. */
  ago: number;
  settled?: {
    outcome: Outcome;
    /** Minutes after filing. */
    after: number;
    note: string;
    verdict?: string;
    basis?: Basis;
  };
  read?: boolean;
  archived?: boolean;
  pinned?: boolean;
  tags?: string[];
  parent?: string;
  via?: Via;
  attachments?: Attachment[];
  misfiled?: string;
  prompt?: string;
};

export function itemOf(n: number, s: Seed, now: number): Item {
  const raisedAt = now - s.ago * MIN;
  const settledAt = s.settled ? raisedAt + s.settled.after * MIN : null;
  return {
    id: n,
    ref: `${s.kind === 'question' ? 'q' : 't'}-${n}`,
    slug: s.slug,
    kind: s.kind,
    text: s.text,
    outcome: s.settled?.outcome ?? null,
    note: s.settled?.note ?? null,
    verdict: s.settled?.verdict ?? null,
    basis: s.settled?.basis ?? null,
    scope: null,
    head: null,
    cites: [],
    via: s.via ?? null,
    usage: null,
    attachments: s.attachments ?? [],
    prompt: s.prompt ?? s.text,
    raisedAt,
    settledAt,
    readAt: s.read && settledAt ? settledAt + 5 * MIN : null,
    archivedAt: s.archived && settledAt ? settledAt + 30 * MIN : null,
    pinned: s.pinned ?? false,
    updatedAt: settledAt ?? raisedAt,
    parent: s.parent ?? null,
    misfiledAt: s.misfiled ? raisedAt + MIN : null,
    misfiledWhy: s.misfiled ?? null,
    tags: s.tags ?? [],
    session: `demo-${s.repo}`,
    harness: 'claude',
    cwd: `~/src/${s.repo}`,
    root: `~/src/${s.repo}`,
    repo: s.repo,
    transcript: null,
    external: [],
  };
}

/** The ledger as the page first sees it, oldest first. */
export const SEEDS: Seed[] = [
  {
    kind: 'question',
    repo: 'hued',
    slug: 'hued-in-tmux',
    text: 'does hued work inside tmux panes?',
    ago: 2900,
    settled: {
      outcome: 'answered',
      after: 4,
      basis: 'measured',
      verdict: 'Yes, once tmux passes OSC 10 and 11 through to the terminal.',
      note: 'tmux swallows the color escapes unless it is told to forward them. With this in `~/.tmux.conf`, each pane recolors as it changes directory:\n\n```sh\nset -g allow-passthrough on\n```\n\nTried in tmux 3.5 under iTerm2 and Ghostty: both recolor the pane, not the whole window.',
    },
    read: true,
    archived: true,
  },
  {
    kind: 'task',
    repo: 'weasel',
    slug: 'fold-hit-tests',
    text: 'fold the three hit-test helpers into one',
    ago: 1500,
    settled: {
      outcome: 'done',
      after: 38,
      note: '✅ Landed in `a41c9e2`.\n\n`hitRect`, `hitPath` and `hitHandle` were the same walk with different leaf tests. `hitTest(node, point, { kinds })` now walks once, and the three callers pass the kinds they want. 412 tests pass unchanged.',
    },
    read: true,
  },
  {
    kind: 'question',
    repo: 'klieg',
    slug: 'bloom-transparency',
    text: 'why does the overlay go opaque when bloom is on?',
    ago: 1320,
    settled: {
      outcome: 'answered',
      after: 12,
      basis: 'read',
      verdict:
        'The stock bloom pass writes alpha 1 everywhere, so it covers the app under the overlay.',
      note: '`UnrealBloomPass` composites onto an opaque target. klieg keeps bloom opt-in for exactly this reason: the direct render path antialiases on its own and leaves the canvas transparent.\n\nTo have both, bloom goes into its own target and is added back over the transparent scene, with alpha taken from the scene and not from the bloom.',
    },
    read: true,
    tags: ['design'],
  },
  {
    kind: 'task',
    repo: 'transom',
    slug: 'heic-support',
    text: 'accept HEIC renders from the phone',
    ago: 1100,
    settled: {
      outcome: 'deferred',
      after: 6,
      note: 'Moved to `docs/TODO.md` under **Formats**. The browser cannot decode HEIC, so it needs a conversion step in the daemon. That is a new native dependency, and it is not worth adding for one source of renders yet.',
    },
    read: true,
    tags: ['later'],
  },
  {
    kind: 'question',
    repo: 'perch',
    slug: 'anything-to-pick-up',
    text: 'anything to pick up?',
    ago: 980,
    settled: { outcome: 'answered', after: 1, note: 'Nothing outstanding in `TODO.md`.' },
    read: true,
    misfiled: 'session logistics, not a question worth keeping',
  },
  {
    kind: 'question',
    repo: 'blits',
    slug: 'locus-handover',
    text: 'how does a locus hand over from one voice to the next?',
    ago: 640,
    settled: {
      outcome: 'answered',
      after: 9,
      basis: 'read',
      verdict:
        "By weight: the outgoing voice's weight falls as the incoming one's rises, and the channel's lerp blends them.",
      note: 'Neither voice knows about the other. The locus owns the weights, and the mix asks each channel how to combine them:\n\n```mermaid\nsequenceDiagram\n  participant A as voice A\n  participant L as locus\n  participant B as voice B\n  L->>A: weight 1 → 0 over 300 ms\n  L->>B: weight 0 → 1 over 300 ms\n  A-->>L: value per frame\n  B-->>L: value per frame\n  L->>L: channel.lerp(a, b, w)\n```\n\nA crossfade and a handover are the same thing. The only difference is whether the outgoing voice keeps running underneath.',
    },
    pinned: true,
  },
  {
    kind: 'question',
    repo: 'kouhai',
    slug: 'cost-of-hooks',
    text: 'what does kouhai add to every request, in tokens?',
    ago: 300,
    settled: {
      outcome: 'answered',
      after: 15,
      basis: 'measured',
      verdict: 'About 1,100 tokens per request, nearly all of it cached after the first turn.',
      note: 'Measured over twenty turns of an ordinary session with `scripts/token-cost.mjs`:\n\n| Source              | Tokens | Cached |\n| ------------------- | -----: | -----: |\n| Server instructions |    640 |   100% |\n| Tool schemas        |    410 |   100% |\n| Prompt hook, a turn |     55 |     0% |\n\nThe per-turn hook line is the only part that misses the cache.',
    },
    tags: ['perf'],
  },
  {
    kind: 'question',
    repo: 'kouhai',
    slug: 'cache-on-model-switch',
    text: 'and if I switch models mid-session?',
    ago: 270,
    parent: 'q-7',
    settled: {
      outcome: 'answered',
      after: 3,
      basis: 'inferred',
      verdict: 'The first request on the new model pays the full 1,100 once, then caches again.',
      note: 'The prompt cache is per model, so nothing carries across the switch. Not measured: worked out from how the cache keys requests.',
    },
  },
  {
    kind: 'question',
    repo: 'transom',
    slug: 'ttl-vs-expiry',
    text: "what's the difference between --ttl and a zone's expiry?",
    ago: 150,
    via: 'btw',
    settled: {
      outcome: 'answered',
      after: 1,
      basis: 'read',
      verdict:
        "`--ttl` sets one picture's lifetime; a zone's expiry is the default for every picture without one.",
      note: 'A render posted with `--ttl 2h` leaves after two hours whatever its zone says. Pinning one overrides both.',
    },
    attachments: [{ kind: 'url', ref: 'https://michaelbaker.tech/transom/', label: 'transom' }],
  },
  {
    kind: 'task',
    repo: 'perch',
    slug: 'notify-action',
    text: 'add a notify action that fires when a watch flips',
    ago: 95,
    settled: {
      outcome: 'done',
      after: 41,
      note: '✅ Landed in `5be07f1`.\n\n```yaml\non_change:\n  - notify: "{{ .name }} is {{ .state }}"\n```\n\n`notify` takes a template, and fires only when the value differs from the last poll. A watch that starts in the flipped state stays quiet on launch.',
    },
  },
  {
    kind: 'task',
    repo: 'klieg',
    slug: 'letter-stagger',
    text: 'stagger each letter’s entrance by its x position, not its index',
    ago: 70,
    tags: ['design'],
  },
  {
    kind: 'question',
    repo: 'weasel',
    slug: 'snap-guide-flicker',
    text: 'why does the snap guide flicker when two edges are within a pixel of each other?',
    ago: 48,
  },
  {
    kind: 'task',
    repo: 'transom',
    slug: 'zip-captions',
    text: 'put the captions in the zip download, as a sidecar json',
    ago: 22,
    tags: ['later'],
  },
  {
    kind: 'question',
    repo: 'hued',
    slug: 'hued-ssh',
    text: 'can a remote shell over ssh pick up the local .hued colors?',
    ago: 9,
  },
];

/** Items that arrive while the page is open, each owed first and settled a little later. */
export const ARRIVALS: Seed[] = [
  {
    kind: 'question',
    repo: 'blits',
    slug: 'spring-overshoot',
    text: 'why does the spring overshoot more at 120 Hz than at 60?',
    ago: 0,
    settled: {
      outcome: 'answered',
      after: 0,
      basis: 'measured',
      verdict: 'It integrated per frame with a fixed step; it now steps on elapsed time.',
      note: 'At 120 Hz the fixed step ran twice as often, so the spring gained energy each frame. It now advances by the time since the last frame, and 60 Hz and 120 Hz come to rest within a millisecond of each other.',
    },
  },
  {
    kind: 'task',
    repo: 'weasel',
    slug: 'guide-hysteresis',
    text: 'give the snap guide a pixel of hysteresis so it stops flickering',
    ago: 0,
    settled: {
      outcome: 'done',
      after: 0,
      note: '✅ Landed in `c07d3b8`.\n\nA guide now lets go only once the edge moves 1.5 px past where it caught, so two edges a pixel apart no longer trade the guide back and forth.',
    },
  },
  {
    kind: 'question',
    repo: 'perch',
    slug: 'menu-width',
    text: 'can the menu be wider than its longest item?',
    ago: 0,
    settled: {
      outcome: 'answered',
      after: 0,
      basis: 'read',
      verdict: 'Yes: `menu.min_width` in points.',
      note: 'AppKit sizes a menu to its widest item. perch sets a minimum on the menu, and an item narrower than that still takes the full width.',
    },
  },
];
