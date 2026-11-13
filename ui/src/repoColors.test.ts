import { describe, expect, it } from 'vitest';
import { inkFor } from './repoColors.ts';

describe('inkFor', () => {
  it('picks white on dark and black on light', () => {
    expect(inkFor('#470013')).toBe('#fff');
    expect(inkFor('#f2b632')).toBe('#000');
    expect(inkFor('#25f7c5')).toBe('#000');
  });
});
