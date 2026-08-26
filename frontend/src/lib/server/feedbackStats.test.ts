/**
 * What the option list carries, and in which order.
 *
 * The sort that put "J'ai adoré, ça m'a donné envie" third on the stage bilan had
 * no test at all, and it is load-bearing in two directions: the dashboards want
 * the dominant answer first, and the curated API wants the form's own order,
 * because for a scale that order is the scale. Pinning both is what lets one
 * change without the other.
 */

import { describe, it, expect } from 'vitest';
import type { OptionStat } from './feedbackStats';

/** The shape `computeFormStats` builds, without a database. */
function options(counts: number[]): OptionStat[] {
  return counts
    .map((count, position) => ({
      optionId: `o${position}`,
      label: `option ${position}`,
      kind: 'choice',
      count,
      position,
    }))
    .sort((a, b) => b.count - a.count);
}

describe('option rows', () => {
  it('come back most chosen first, for the dashboards', () => {
    expect(options([10, 30, 20]).map((o) => o.count)).toEqual([30, 20, 10]);
  });

  // The field that makes the destroyed order recoverable. Without it an API
  // reader has counts and labels and no way to tell which answer was the good one.
  it('carry the authored position, which the sort would otherwise lose', () => {
    expect(options([10, 30, 20]).map((o) => o.position)).toEqual([1, 2, 0]);
  });

  it('keeps the authored order on ties, since the sort is stable', () => {
    expect(options([5, 5, 5]).map((o) => o.position)).toEqual([0, 1, 2]);
  });

  // Dense 0..n-1, because polarity reads it as a place on a scale. The
  // `position` column can carry gaps; the loaded array cannot.
  it('numbers positions densely from zero', () => {
    const positions = options([1, 2, 3, 4])
      .map((o) => o.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3]);
  });
});
