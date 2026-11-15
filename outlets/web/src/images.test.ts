import { marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { localImages } from './images.ts';

describe('localImages', () => {
  it("sends a note's local images through the daemon, and leaves remote ones alone", () => {
    const html = marked.parse('![a](/tmp/x.png) ![b](https://e.com/y.png)', {
      async: false,
      walkTokens: localImages('q-3'),
    });
    expect(html).toContain('src="/api/image?id=q-3&amp;path=%2Ftmp%2Fx.png"');
    expect(html).toContain('src="https://e.com/y.png"');
  });
});
