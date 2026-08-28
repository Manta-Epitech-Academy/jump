import { describe, it, expect } from 'vitest';
import { buildOrderBy } from './query';

describe('buildOrderBy', () => {
  it('puts never active first when the oldest leads, and last on the way back', () => {
    // The one nullable column here whose absent rows do NOT sink in both
    // directions. "Jamais" is the far end of the axis, not a missing value, so
    // one click groups every talent nobody has seen log in at the top. The
    // members directory orders the same way, and there the same rule replaced a
    // filter tile outright.
    expect(buildOrderBy('activite', 'asc')[0]).toEqual({
      lastActiveAt: { sort: 'asc', nulls: 'first' },
    });
    expect(buildOrderBy('activite', 'desc')[0]).toEqual({
      lastActiveAt: { sort: 'desc', nulls: 'last' },
    });
  });

  it('keeps sinking the rows a column cannot describe', () => {
    // Niveau is the contrast that makes the case above deliberate: an unknown
    // niveau says the column has nothing to report, so it belongs at the bottom
    // whichever way the arrow points.
    expect(buildOrderBy('niveau', 'asc')[0]).toEqual({
      niveau: { sort: 'asc', nulls: 'last' },
    });
    expect(buildOrderBy('niveau', 'desc')[0]).toEqual({
      niveau: { sort: 'desc', nulls: 'last' },
    });
  });

  it('falls back to most recently active, so an empty sort param cannot break the page', () => {
    // The list and the CSV export share this function precisely so they cannot
    // drift, which is why the fallback is asserted rather than assumed.
    expect(buildOrderBy('', 'asc')).toEqual([
      { lastActiveAt: { sort: 'desc', nulls: 'last' } },
      { nom: 'asc' },
    ]);
  });
});
