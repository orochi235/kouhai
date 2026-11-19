export type Via = 'btw' | 'ask';

/** One side question this session, its answer, and the dixeram item that keeps it. */
export type Aside = { question: string; answer: string; ref: string | null; via: Via };

declare module 'claude-code' {
  interface PluginState {
    'dixeram-aside': { shown: Aside | null; recent: Aside[] };
  }
}
