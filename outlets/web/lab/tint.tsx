import { type ConfigOf, defineInstrument, f } from '@weasel-js/labkit';
import { useThemeOptional } from '@weasel-js/theme/react';
import { useId } from 'react';
import type { Item } from '../src/api.ts';
import { Reader } from '../src/components/Reader.tsx';
import { inkFor, repoClass } from '../src/repoColors.ts';

/** Real projects' .hued colors (2026-11-16): dark, saturated, pale, and loud, to see where a tint breaks. */
const SAMPLES = [
  { repo: 'kouhai', background: '#331300', foreground: '#fed8ca', accent: '#ebaa19' },
  { repo: 'colm', background: '#a50a22', foreground: '#e4e4e4', accent: '#efa319' },
  { repo: 'fiddy', background: '#086947', foreground: '#fff3e7', accent: '#e48b15' },
  { repo: 'beamos', background: '#9dcffd', foreground: '#000000', accent: '' },
  { repo: 'onto', background: '#7fff00', foreground: '', accent: '' },
  { repo: 'brainhouse', background: '#320053', foreground: '', accent: '' },
] as const;

const config = f.schema({
  source: f.enum('background', ['background', 'foreground', 'accent']).label('Source'),
  surface: f.enum('pane', ['pane', 'toolbar', 'sheet', 'edge']).label('Surface'),
  blend: f.enum('wash', ['wash', 'mix', 'fade']).label('Blend'),
  strength: f.number(10).range(0, 40).step(1).label('Strength %'),
  darkStrength: f.number(17).range(0, 40).step(1).label('Strength % in dark'),
  darkLift: f.number(0).range(0, 80).step(5).label('Lift toward white in dark %'),
});
type Config = ConfigOf<typeof config>;

const item = (repo: string): Item => ({
  id: 1,
  ref: 'q-1',
  external: [],
  slug: 'does-the-tint-read',
  kind: 'question',
  text: 'does the tint read?',
  note: 'A paragraph of answer text, with **bold** and `code`, to judge contrast against the tint.',
  outcome: 'answered',
  verdict: null,
  basis: null,
  scope: null,
  head: null,
  cites: [],
  via: null,
  usage: null,
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

/** The candidate tint as a stylesheet, scoped to one trial's cells; the winner moves into Reader.css. */
function sheet(c: Config, dark: boolean, scope: string): string {
  const colors = SAMPLES.map((s) => {
    const raw = s[c.source] || s.background;
    return `${scope} .${repoClass(s.repo)}{--chip-bg:${s.background};--chip-fg:${s.foreground || inkFor(s.background)};--tint-raw:${raw}}`;
  });
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
      ? `${scope} .cell .reader{box-shadow: inset 4px 0 0 ${color};}`
      : `${scope} .cell ${target}{${fill}}`;
  return [...colors, `${scope} .cell .reader{background:none}`, rule].join('\n');
}

const noop = () => {};

/** The six readers, in the scheme labkit's View → Theme puts the lab in. */
function Cells({ config }: { config: Config }) {
  const scheme = useThemeOptional()?.selection.mode === 'light' ? 'light' : 'dark';
  const id = useId();
  return (
    <div className="tint-lab" data-scheme={scheme} data-tint={id}>
      <style>{sheet(config, scheme === 'dark', `.tint-lab[data-tint="${id}"]`)}</style>
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
            {s.repo} <code>{s[config.source] || `${s.background} (no ${config.source})`}</code>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export const Tint = defineInstrument<Record<string, never>, Config>({
  name: 'Reader tint',
  config,
  initialState: () => ({}),
  render: (ctx) => <Cells config={ctx.config} />,
});
