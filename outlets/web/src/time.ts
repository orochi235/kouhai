import { useSyncExternalStore } from 'react';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Snapshot rounded to the minute, so subscribers re-render only when a label could change.
const minute = () => Math.floor(Date.now() / MIN) * MIN;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 15_000);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onChange);
  };
}

/** The current time to the minute, for labels that read relative to now. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, minute);
}

/** A short age for the list: 4m, 3h, 2d, then a date. */
export function age(ms: number, now = Date.now()): string {
  const d = now - ms;
  if (d < MIN) return 'now';
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function stamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
