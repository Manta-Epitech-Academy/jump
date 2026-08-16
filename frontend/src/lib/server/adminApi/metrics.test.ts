/**
 * The arithmetic this tier does so that no consumer has to.
 *
 * Worth testing rather than eyeballing because both helpers exist to prevent a
 * specific misreading, and each has a case where returning zero would be a lie:
 * 0 % of an empty cohort, and "no movement" against a year that has no figure.
 */

import { describe, it, expect } from 'vitest';
import { share, variation } from './metrics';

describe('share', () => {
  it('rounds to one decimal', () => {
    expect(share(1, 3)).toBe(33.3);
  });

  it('is null, never zero, when there is nothing to divide', () => {
    expect(share(0, 0)).toBeNull();
  });
});

describe('variation', () => {
  it('gives a count both an absolute and a relative gap', () => {
    const { value } = variation(118, 100, 'count', '2025-2026');
    expect(value).toEqual({ previous: 100, absolute: 18, relative: 18 });
  });

  it('withholds the relative gap on a rate, and says why', () => {
    const { value, definition } = variation(30, 20, 'points', '2025-2026');
    // The whole point: +10 points, not "+50 %".
    expect(value).toEqual({ previous: 20, absolute: 10, relative: null });
    expect(definition).toContain('points');
    expect(definition).toContain('2025-2026');
  });

  it('handles a note out of five like a rate, in points of its own scale', () => {
    const { value } = variation(4.4, 4.2, 'points', '2025-2026');
    expect(value.absolute).toBe(0.2);
    expect(value.relative).toBeNull();
  });

  it('reports no movement at all when either side is unknown', () => {
    expect(variation(null, 20, 'points', '2025-2026').value).toEqual({
      previous: 20,
      absolute: null,
      relative: null,
    });
    // A figure that did not exist last year is not a 100 % rise from zero, and
    // the previous value is still echoed so the gap is visibly unmeasurable.
    expect(variation(40, null, 'count', '2025-2026').value).toEqual({
      previous: null,
      absolute: null,
      relative: null,
    });
  });

  it('refuses to divide by a previous value of zero', () => {
    const { value } = variation(12, 0, 'count', '2025-2026');
    expect(value.absolute).toBe(12);
    expect(value.relative).toBeNull();
  });
});
