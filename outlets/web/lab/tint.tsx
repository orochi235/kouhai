import { type ConfigOf, defineInstrument, f } from '@weasel-js/labkit';
import type { Item } from '../src/api.ts';
import { Reader } from '../src/components/Reader.tsx';
import { inkFor, repoClass } from '../src/repoColors.ts';

/** Real projects' .hued colors (2026-11-16): dark, saturated, pale, and loud, to see where a tint breaks. */
const SAMPLES = [
  { repo: 'dixeram', background: '#331300', foreground: '#fed8ca', accent: '#ebaa19' },
  { repo: 'colm', background: '#a50a22', foreground: '#e4e4e4', accent: '#efa319' },
  { repo: 'fiddy', background: '#086947', foreground: '#fff3e7', accent: '#e48b15' },
  { repo: 'beamos', background: '#9dcffd', foreground: '#000000', accent: '' },
  { repo: 'onto', background: '#7fff00', foreground: '', accent: '' },
  { repo: 'brainhouse', background: '#320053', foreground: '', accent: '' },
] as const;

const config = f.schema({
  theme: f.enum('light', ['light', 'dark']).label('Theme'),
  source: f.enum('background', ['background', 'foreground', 'accent']).label('Project color'),
  surface: f.enum('pane', ['pane', 'toolbar', 'sheet', 'edge']).label('Surface'),
  blend: f.enum('wash', ['wash', 'mix', 'fade']).label('Blend'),
  strength: f.number(7).range(0, 40).step(1).label('Strength %'),
  darkStrength: f.number(7).range(0, 40).step(1).label('Strength % in dark'),
  darkLift: f.number(0).range(0, 80).step(5).label('Lift toward white in dark %'),
});
type Config = ConfigOf<typeof config>;

const item = (repo: string): Item => ({
  id: 1,
  ref: 'q-1',
  kind: 'question',
  text: 'does the tint read?',
  note: 'A paragraph of answer text, with **bold** and `code`, to judge contrast against the tint.',
  outcome: 'answered',
  repo,
  harness: 'msb',
  cwd: `/Users/mike/src/${repo}`,
  root: `/Users/mike/src/${repo}`,
  session: 's',
  transcript: null,
  prompt: null,
  attachments: [],
  raisedAt: Date.now(),
  settledAt: Date.now(),
  readAt: Date.now(),
  archivedAt: null,
  pinned: false,
  updatedAt: Date.now(),
  parent: null,
  misfiledAt: null,
  misfiledWhy: null,
  tags: [],
});

/** The candidate tint as a stylesheet, scoped to the lab's cells; the winner moves into Reader.css. */
function sheet(c: Config): string {
  const colors = SAMPLES.map((s) => {
    const raw = s[c.source] || s.background;
    return `.tint-lab .${repoClass(s.repo)}{--chip-bg:${s.background};--chip-fg:${s.foreground || inkFor(s.background)};--tint-raw:${raw}}`;
  });
  const dark = c.theme === 'dark';
  const pct = dark ? c.darkStrength : c.strength;
  const color =
    dark && c.darkLift
      ? `color-mix(in oklab, var(--tint-raw), white ${c.darkLift}%)`
      : 'var(--tint-raw)';
  const fill =
    c.blend === 'mix'
      ? `background-color: color-mix(in oklab, ${color} ${pct}%, var(--paper));`
      : c.blend === 'fade'
        ? `background-image: linear-gradient(to bottom, color-mix(in srgb, ${color} ${pct * 2}%, transparent), transparent 70%);`
        : `background-color: color-mix(in srgb, ${color} ${pct}%, transparent);`;
  const target =
    c.surface === 'toolbar'
      ? '.reader .toolbar'
      : c.surface === 'sheet'
        ? '.reader .sheet'
        : '.reader';
  const rule =
    c.surface === 'edge'
      ? `.tint-lab .cell .reader{box-shadow: inset 4px 0 0 ${color};}`
      : `.tint-lab .cell ${target}{${fill}}`;
  return [...colors, '.tint-lab .cell .reader{background:none}', rule].join('\n');
}

const noop = () => {};

export const Tint = defineInstrument<Record<string, never>, Config>({
  name: 'Reader tint',
  config,
  initialState: () => ({}),
  render: (ctx) => (
    <div className="tint-lab" data-scheme={ctx.config.theme}>
      <style>{sheet(ctx.config)}</style>
      {SAMPLES.map((s) => (
        <figure key={s.repo} className="cell">
          <div className="frame">
            <Reader
              item={item(s.repo)}
              parent={null}
              tags={[]}
              onTag={noop}
              onSelect={noop}
              onArchive={noop}
              onPin={noop}
              onUnread={noop}
              onReveal={noop}
              onOpenPath={noop}
              onMisfile={noop}
              askMisfile={0}
            />
          </div>
          <figcaption>
            {s.repo}{' '}
            <code>{s[ctx.config.source] || `${s.background} (no ${ctx.config.source})`}</code>
          </figcaption>
        </figure>
      ))}
    </div>
  ),
});
