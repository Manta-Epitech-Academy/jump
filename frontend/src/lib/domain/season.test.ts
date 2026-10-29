import { describe, it, expect } from 'vitest';
import { seasonOn } from './season';

describe('seasonOn', () => {
  it('is Halloween from 15 October to the 31st', () => {
    expect(seasonOn('2026-10-14')).toBeNull();
    expect(seasonOn('2026-10-15')).toBe('halloween');
    expect(seasonOn('2026-10-31')).toBe('halloween');
    expect(seasonOn('2026-11-01')).toBeNull();
  });

  it('is winter for the whole of December', () => {
    expect(seasonOn('2026-11-30')).toBeNull();
    expect(seasonOn('2026-12-01')).toBe('winter');
    expect(seasonOn('2026-12-31')).toBe('winter');
    expect(seasonOn('2027-01-01')).toBeNull();
  });
});
