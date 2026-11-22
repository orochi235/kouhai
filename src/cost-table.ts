// `kouhai cost`: each day's turns, what they read and wrote, and kouhai's estimated share.
import type { Day } from './engine/costs.ts';
import { weighed } from './engine/meter.ts';

const k = (n: number) => (n / 1000).toFixed(1);
const context = (d: Day) => d.input + d.cacheRead + d.cacheWrite;

/** What kouhai adds to the rest of the session's cost, weighted by API price. */
const extra = (d: Day) => {
  const w = weighed(d);
  return `${((100 * w.kouhai) / (w.all - w.kouhai || 1)).toFixed(1)}%`;
};

const COLUMNS: [string, (d: Day) => string][] = [
  ['day', (d) => d.day],
  ['turns', (d) => String(d.turns)],
  ['calls', (d) => String(d.calls)],
  ['input k', (d) => k(d.input)],
  ['read k', (d) => k(d.cacheRead)],
  ['write k', (d) => k(d.cacheWrite)],
  ['1h write k', (d) => k(d.cacheWrite1h)],
  ['output k', (d) => k(d.output)],
  ['kouhai k', (d) => k(d.kouhaiRead)],
  ['share', (d) => `${((100 * d.kouhaiRead) / (context(d) || 1)).toFixed(1)}%`],
  ['extra', (d) => extra(d)],
  ['trips', (d) => String(d.trips)],
  ['trip read k', (d) => k(d.tripRead)],
];

export function costTable(days: Day[]): string {
  if (!days.length) return 'no turn costs recorded';
  const total: Day = {
    day: 'total',
    turns: 0,
    calls: 0,
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    output: 0,
    kouhaiAdded: 0,
    kouhaiOutput: 0,
    kouhaiRead: 0,
    trips: 0,
    tripRead: 0,
  };
  for (const d of days)
    for (const key of Object.keys(total) as (keyof Day)[])
      if (key !== 'day') (total[key] as number) += d[key] as number;
  const rows = [...days, total].map((d) => COLUMNS.map(([, f]) => f(d)));
  const widths = COLUMNS.map(([h], i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
      .join('  ');
  return [fmt(COLUMNS.map(([h]) => h)), ...rows.map(fmt)].join('\n');
}
