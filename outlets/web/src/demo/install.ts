import { createDemoDaemon } from './daemon.ts';

/**
 * Imported for its effect, and only in the demo build: answers the page's API calls and event
 * stream from an in-memory ledger. Its own module so the one `import()` that pulls it in can be
 * dropped from the ordinary bundle.
 */
const demo = createDemoDaemon();
const ours = (u: URL) => u.pathname.startsWith('/api/') || u.pathname === '/outlets/web/glyphs';

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  return ours(url) ? demo.fetch(url, init) : realFetch(input, init);
};

class DemoEventSource extends EventTarget {
  onerror: ((e: Event) => void) | null = null;
  private off: () => void;
  constructor(_url: string) {
    super();
    const send = (version: string) =>
      this.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ version }) }));
    this.off = demo.subscribe(send);
    queueMicrotask(() => send(demo.version()));
  }
  close() {
    this.off();
  }
}
window.EventSource = DemoEventSource as unknown as typeof EventSource;
