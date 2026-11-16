import { openPrefsSync, type PrefGroup } from '@weasel-js/prefs';
import { localStorageAdapter } from '@weasel-js/storage';

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
