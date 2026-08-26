/**
 * The arithmetic this tier does so that no consumer has to.
 *
 * Worth testing rather than eyeballing because both helpers exist to prevent a
 * specific misreading, and each has a case where returning zero would be a lie:
 * 0 % of an empty cohort, and "no movement" against a year that has no figure.
 */

import { describe, it, expect } from 'vitest';
import {
  share,
  median,
  variation,
  rank,
  rankAxisNote,
  RANK_UNITS,
} from './metrics';

describe('share', () => {
  it('rounds to one decimal', () => {
    expect(share(1, 3)).toBe(33.3);
  });

  it('is null, never zero, when there is nothing to divide', () => {
    expect(share(0, 0)).toBeNull();
  });
});

describe('median', () => {
  it('takes the middle of an odd-sized set', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  // The reason this helper is shared: the inline version it replaced returned the
  // upper of the two middles, so it read as a real figure while sitting one order
  // statistic high on every even-sized cohort.
  it('averages the two middle values of an even-sized set', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('does not depend on the caller having sorted anything', () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it('is null, never zero, on an empty set', () => {
    expect(median([])).toBeNull();
  });

  it('rounds like a share, to one decimal', () => {
    expect(median([1, 2])).toBe(1.5);
    expect(median([0, 1, 1, 1, 1, 1, 8])).toBe(1);
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

describe('rank', () => {
  const label = (row: { campus: string }) => row.campus;
  const value = (row: { value: number | null }) => row.value;

  it('sorts descending and stamps positions', () => {
    const ranked = rank(
      [
        { campus: 'Nice', value: 10 },
        { campus: 'Lille', value: 30 },
        { campus: 'Lyon', value: 20 },
      ],
      label,
      value,
    );
    expect(ranked.map((r) => [r.campus, r.rank])).toEqual([
      ['Lille', 1],
      ['Lyon', 2],
      ['Nice', 3],
    ]);
  });

  // Competition ranking, not dense: the missing 2 is what says two rows tied.
  it('gives tied rows the same rank and leaves the gap after them', () => {
    const ranked = rank(
      [
        { campus: 'Lille', value: 30 },
        { campus: 'Nice', value: 10 },
        { campus: 'Nantes', value: 30 },
      ],
      label,
      value,
    );
    expect(ranked.map((r) => [r.campus, r.value, r.rank])).toEqual([
      ['Lille', 30, 1],
      ['Nantes', 30, 1],
      ['Nice', 10, 3],
    ]);
  });

  // The whole reason this is shared rather than re-derived: an unmeasurable row
  // placed last with a rank reads as the worst one.
  it('puts unmeasurable rows last and leaves them unranked', () => {
    const ranked = rank(
      [
        { campus: 'Lyon', value: null },
        { campus: 'Lille', value: 5 },
      ],
      label,
      value,
    );
    expect(ranked.map((r) => [r.campus, r.rank])).toEqual([
      ['Lille', 1],
      ['Lyon', null],
    ]);
  });

  it('ranks a measurable zero, which is a result and not an absence', () => {
    const ranked = rank(
      [
        { campus: 'Lille', value: 0 },
        { campus: 'Lyon', value: null },
      ],
      label,
      value,
    );
    expect(ranked.map((r) => [r.campus, r.rank])).toEqual([
      ['Lille', 1],
      ['Lyon', null],
    ]);
  });

  it('keeps rank null exactly when value is null', () => {
    const ranked = rank(
      [
        { campus: 'Lille', value: 5 },
        { campus: 'Lyon', value: null },
        { campus: 'Nice', value: 0 },
      ],
      label,
      value,
    );
    for (const row of ranked) {
      expect(row.value === null).toBe(row.rank === null);
    }
  });

  // A ranking that reshuffles between two identical calls reads as a change.
  it('breaks ties on the label, so the order is stable across calls', () => {
    const rows = [
      { campus: 'Nantes', value: 7 },
      { campus: 'Lille', value: 7 },
      { campus: 'Épinal', value: null },
      { campus: 'Aix', value: null },
    ];
    const once = rank(rows, label, value).map((r) => r.campus);
    const twice = rank([...rows].reverse(), label, value).map((r) => r.campus);
    expect(once).toEqual(['Lille', 'Nantes', 'Aix', 'Épinal']);
    expect(twice).toEqual(once);
  });
});

describe('rankAxisNote', () => {
  it('explains rank and null, in the unit being ranked', () => {
    const campus = rankAxisNote(RANK_UNITS.campus);
    expect(campus).toContain('Un campus par ligne');
    expect(campus).toContain('null');
    expect(campus).toContain('Deux campus à égalité partagent le même rang.');
  });

  it('agrees the plural, so a second axis does not reword the rule', () => {
    const event = rankAxisNote(RANK_UNITS.event);
    expect(event).toContain('Un événement par ligne');
    expect(event).toContain('Les événements dont la valeur');
    expect(event).toContain('Deux événements à égalité');
  });
});
