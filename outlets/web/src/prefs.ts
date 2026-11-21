import { SETTINGS, type Settings } from '@core/types.ts';
import { openPrefsSync, type PrefGroup } from '@weasel-js/prefs';
import { localStorageAdapter } from '@weasel-js/storage';
import { api } from './api.ts';

/** The page's preferences, kept per browser; Mod+, edits them. */
export const PREFS = {
  name: 'Preferences',
  children: {
    inbox: {
      name: 'Inbox',
      children: {
        openOn: {
          kind: 'enum',
          name: 'Open on',
          description:
            'The inbox the page shows when it opens; a link to one item opens that item’s inbox',
          default: 'question',
          options: [
            { value: 'question', label: 'Questions' },
            { value: 'task', label: 'Tasks' },
          ],
        },
        archiveDone: {
          kind: 'boolean',
          name: 'Archive done tasks',
          description:
            'A task settled as done goes straight to Archived, unless it is pinned. The ledger keeps this one, so it holds in every browser',
          default: SETTINGS.archiveDone,
        },
        readOnOpen: {
          kind: 'boolean',
          name: 'Mark read on open',
          description: 'Opening a settled item marks it read',
          default: true,
        },
      },
    },
  },
} as const satisfies PrefGroup;

export const prefs = openPrefsSync(PREFS, {
  storage: localStorageAdapter,
  prefix: 'dixeram.prefs.',
});

/**
 * Mirrors the prefs the ledger keeps: takes the ledger's values on load, and sends each local change
 * back. The ledger's value is the one capture reads, so it wins.
 */
export function syncLedgerPrefs(s: Settings | null) {
  if (s && prefs.get('inbox.archiveDone') !== s.archiveDone)
    prefs.set('inbox.archiveDone', s.archiveDone);
  return prefs.subscribe((changes) => {
    for (const c of changes)
      if (c.path === 'inbox.archiveDone' && typeof c.value === 'boolean')
        void api.saveSettings({ archiveDone: c.value }).catch(() => {});
  });
}
