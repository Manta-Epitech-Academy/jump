import { describe, it, expect } from 'vitest';
import { facetControls } from './facetControls';
import type { ListFacet } from '$lib/domain/listFacets';

/**
 * Every filtered staff list builds its header filters and its chips here, so a
 * chip that names the wrong value or removes the wrong one would be wrong on
 * every list at once.
 */

const facets: ListFacet<'niveau' | 'genre'>[] = [
  {
    facet: 'niveau',
    title: 'Niveau',
    options: [
      { value: '2nde', label: 'Seconde', count: 4 },
      { value: '1ere', label: 'Première', count: 9 },
    ],
    selected: ['2nde', '1ere'],
  },
  // A single value to offer: kept as a column, never as a filter.
  { facet: 'genre', title: 'Genre', options: [], selected: [] },
];

function recorded() {
  const calls: [string, string[]][] = [];
  const controls = facetControls(facets, (facet, values) =>
    calls.push([facet, values]),
  );
  return { controls, calls };
}

describe('facetControls', () => {
  it('names each ticked value by its label, under its facet', () => {
    const { controls } = recorded();
    expect(controls.chips.map((c) => [c.facet, c.label])).toEqual([
      ['Niveau', 'Seconde'],
      ['Niveau', 'Première'],
    ]);
  });

  it('removes only the chip clicked', () => {
    const { controls, calls } = recorded();
    controls.chips[0].onRemove();
    expect(calls).toEqual([['niveau', ['1ere']]]);
  });

  it('offers no header filter on a facet with a single value', () => {
    const { controls } = recorded();
    expect(controls.has('genre')).toBe(true);
    expect(controls.filterOf('genre')).toBeUndefined();
    expect(controls.filterOf('niveau')?.selected).toEqual(['2nde', '1ere']);
  });
});
