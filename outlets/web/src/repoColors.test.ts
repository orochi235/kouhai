import { describe, expect, it } from 'vitest';
import type { Repo } from './api.ts';
import { iconsOf, inkFor, repoSheet } from './repoColors.ts';

describe('inkFor', () => {
  it('picks white on dark and black on light', () => {
    expect(inkFor('#470013')).toBe('#fff');
    expect(inkFor('#f2b632')).toBe('#000');
    expect(inkFor('#25f7c5')).toBe('#000');
  });
});

describe('repoSheet', () => {
  const repo = (name: string, icon: string) =>
    ({ repo: name, hued: { bg: '#331300', fg: '', icon } }) as unknown as Repo;

  it('shows a glyph only for an icon that drew', () => {
    const sheet = repoSheet([repo('a', 'leaf'), repo('b', 'bogus')], { leaf: 'PNG' });
    const [a, b] = sheet.split('\n');
    expect(a).toContain('--glyph:url(data:image/png;base64,PNG);--glyph-show:inline-block;');
    expect(b).not.toContain('--glyph');
    expect(iconsOf([repo('a', 'leaf'), repo('b', 'leaf'), repo('c', '')])).toEqual(['leaf']);
  });
});
