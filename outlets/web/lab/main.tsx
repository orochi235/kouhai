import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@weasel-js/theme/tokens.css';
import '@weasel-js/ui/style.css';
import '@weasel-js/labkit/styles.css';
import '../src/base.css';
import './lab.css';
import icons from 'virtual:weasel-icons';
import { IconRegistryProvider } from '@weasel-js/icons/react';
import { Lab } from '@weasel-js/labkit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Tint } from './tint.tsx';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <IconRegistryProvider icons={icons}>
      <Lab instruments={[Tint]} title="kouhai tint" storageKey="dixeram-tint-lab" />
    </IconRegistryProvider>
  </StrictMode>,
);
