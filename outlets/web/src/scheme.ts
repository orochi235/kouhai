import { useColorModePreference } from '@weasel-js/theme/react';
import { useEffect } from 'react';

/** The page's color scheme: the one the top bar picked, else the system's. */
export function currentScheme(): 'light' | 'dark' {
  const picked = document.documentElement.dataset.scheme;
  if (picked === 'light' || picked === 'dark') return picked;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The top bar's Auto / Light / Dark choice, remembered, and put on the page as `data-scheme`. */
export function useSchemeChoice() {
  const choice = useColorModePreference({ storageKey: 'dixeram.colorMode' });
  useEffect(() => {
    const root = document.documentElement;
    if (choice.preference === 'auto') delete root.dataset.scheme;
    else root.dataset.scheme = choice.preference;
  }, [choice.preference]);
  return choice;
}
