import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from '../engine/store.ts';
import { asideOf, fileAside } from './aside.ts';
import { fileBtws } from './btw.ts';

const aside = {
  session: 's1',
  cwd: '/r',
  question: 'what is PBT?',
  answer: 'Property-based testing.',
  via: 'btw' as const,
  usage: { cache_read_input_tokens: 1000 },
};

describe('fileAside', () => {
  it('files the question already answered, with the fork usage', () => {
    const s = new Store(':memory:');
    const q = fileAside(s, aside);
    expect(q).toMatchObject({
      ref: 'q-1',
      outcome: 'answered',
      note: 'Property-based testing.',
      via: 'btw',
      session: 's1',
      usage: { cache_read_input_tokens: 1000 },
    });
  });

  it('refuses JSON missing a field, and reads anything but btw as ask', () => {
    expect(() => asideOf('{"session":"s1"}')).toThrow('cwd');
    expect(asideOf(JSON.stringify({ ...aside, via: 'x' })).via).toBe('ask');
  });

  it('keeps the history importer from filing a /btw the mod already answered', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kouhai-aside-'));
    try {
      const history = join(dir, 'history.jsonl');
      writeFileSync(history, '');
      const s = new Store(':memory:');
      fileBtws(s, dir);
      fileAside(s, aside);
      appendFileSync(
        history,
        `${JSON.stringify({ display: '/btw what is PBT?', sessionId: 's1', project: '/r' })}\n`,
      );
      expect(fileBtws(s, dir)).toEqual([]);
      expect(s.list('all')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
