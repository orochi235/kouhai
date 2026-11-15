import { describe, expect, it } from 'vitest';
import { detect } from './detect.ts';

const c = (p: string) => detect(p).candidate;

describe('detect', () => {
  it('flags question marks and wh-questions', () => {
    expect(c('fix the lint. why does CI take 9 minutes?')).toBe(true);
    expect(c('rename it, and how does the cache get invalidated')).toBe(true);
    expect(c('what is the default port')).toBe(true);
  });

  it('ignores plain orders', () => {
    expect(c('gogogo')).toBe(false);
    expect(c('do the strikethroughs')).toBe(false);
    expect(c('rename foo to bar and commit')).toBe(false);
  });

  it('ignores question marks in code, links, quotes, and pastes', () => {
    expect(c('run `ls ?(a|b)` then commit')).toBe(false);
    expect(c('fetch https://x.test/?q=1')).toBe(false);
    expect(c('> is this a quote?\nfix it')).toBe(false);
    expect(c('<pasted_content id="1">why?</pasted_content> summarize')).toBe(false);
    expect(c('```\nwhy?\n```\nship it')).toBe(false);
  });

  it('forces on a leading ??', () => {
    expect(detect('?? the port is 8771 right')).toEqual({ forced: true, candidate: true });
  });

  it("forces on (??) anywhere in the user's own words, not in code or a paste", () => {
    expect(detect("fix the lint, then what's next (??)").forced).toBe(true);
    expect(detect('run `echo (??)` and commit').forced).toBe(false);
    expect(detect('<pasted_content id="1">(??)</pasted_content> summarize').forced).toBe(false);
  });
});
