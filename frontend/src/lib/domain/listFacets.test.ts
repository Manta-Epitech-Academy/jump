import { describe, it, expect } from 'vitest';
import { offerFacets } from './listFacets';

/**
 * `offerFacets` is where the filter rules live for every staff list, whether
 * the rows counted themselves in memory or the database counted them. A list
 * paged on the server reaches the rules only through it, so they are pinned
 * here rather than through one roster's facets.
 */

const niveau = (counts: [string, number][]) => ({
  facet: 'niveau' as const,
  title: 'Niveau',
  counts: counts.map(([value, count]) => ({ value, label: value, count })),
});

describe('offerFacets', () => {
  it('offers the counted values in the order given', () => {
    const [facet] = offerFacets(
      [
        niveau([
          ['2nde', 4],
          ['1ere', 9],
        ]),
      ],
      { niveau: [] },
    );
    expect(facet.options.map((o) => o.value)).toEqual(['2nde', '1ere']);
  });

  it('drops a value no row carries, as a database bucket at zero would be', () => {
    const [facet] = offerFacets(
      [
        niveau([
          ['2nde', 4],
          ['1ere', 0],
          ['term', 2],
        ]),
      ],
      { niveau: ['1ere', 'term'] },
    );
    expect(facet.options.map((o) => o.value)).toEqual(['2nde', 'term']);
    expect(facet.selected).toEqual(['term']);
  });

  it('offers no filter on a facet of a single value, and ignores its param', () => {
    const [facet] = offerFacets([niveau([['2nde', 12]])], {
      niveau: ['2nde'],
    });
    expect(facet.options).toEqual([]);
    expect(facet.selected).toEqual([]);
  });

  it('ignores a ticked value the list does not carry', () => {
    const [facet] = offerFacets(
      [
        niveau([
          ['2nde', 4],
          ['1ere', 9],
        ]),
      ],
      { niveau: ['3e', '1ere'] },
    );
    expect(facet.selected).toEqual(['1ere']);
  });
});
