import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@weasel-js/theme/tokens.css';
import '@weasel-js/ui/style.css';
import './base.css';
import './weasel.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { api } from './api.ts';
import { syncLedgerPrefs } from './prefs.ts';
import { setRefFormat } from './refs.ts';

// A build-time literal, so the ordinary bundle drops the demo and its sample ledger.
if (__KOUHAI_DEMO__) await import('./demo/install.ts');

const settings = await api.settings().catch(() => null);
if (settings) setRefFormat(settings.refs);
syncLedgerPrefs(settings);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
