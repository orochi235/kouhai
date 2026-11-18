import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedSince, citesIn, headOf } from './git.ts';

describe('citesIn', () => {
  it('finds linked files under the root, once each, without line numbers', () => {
    const note =
      'See [store.ts:42](/r/src/store.ts:42), [again](/r/src/store.ts), ' +
      '[url](file:///r/README.md), [elsewhere](/x/y.ts), and [web](https://e.com/a).';
    expect(citesIn(note, '/r')).toEqual(['src/store.ts', 'README.md']);
  });
});

describe('changedSince', () => {
  it('names cited files changed since a commit, committed or not', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dixeram-git-')));
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    try {
      git('init', '-q');
      writeFileSync(join(root, 'a.ts'), '1');
      writeFileSync(join(root, 'b.ts'), '1');
      git('add', '.');
      git('commit', '-qm', 'one');
      const head = headOf(root) as string;
      expect(head).toMatch(/^[0-9a-f]{40}$/);
      writeFileSync(join(root, 'a.ts'), '2');
      expect(changedSince(root, head, ['a.ts', 'b.ts'])).toEqual(['a.ts']);
      expect(changedSince(root, 'nope', ['a.ts'])).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
