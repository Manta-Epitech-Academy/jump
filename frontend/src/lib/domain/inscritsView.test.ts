import { describe, it, expect } from 'vitest';
import {
  INSCRITS_FACETS,
  inscritsClearedFacetParams,
  inscritsFacetParams,
  inscritsSortParams,
  parseInscritsView,
} from './inscritsView';

/**
 * The Inscrits address is a contract with whoever writes it: the page's own
 * filters, a link pasted by a colleague, and the event home's cards. What has to
 * hold is that a written view reads back as itself, that the bare address is the
 * unfiltered list in its default order, and that nothing a hand-edited address
 * carries can break the read.
 */

/** What `setListParams` would leave in the querystring. */
function written(...changes: Record<string, string>[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const change of changes)
    for (const [key, value] of Object.entries(change)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
  return params;
}

describe('the inscrits view address', () => {
  it('reads the bare address as the unfiltered list, by nom', () => {
    const view = parseInscritsView(new URLSearchParams());
    expect(view.sort).toBe('nom');
    expect(view.dir).toBe('asc');
    for (const facet of INSCRITS_FACETS) expect(view.facets[facet]).toEqual([]);
  });

  it('reads back several values of several facets as written', () => {
    const params = written(
      inscritsFacetParams('niveau', ['2nde', '1ere']),
      inscritsFacetParams('parcours', ['nouveau']),
      inscritsFacetParams('lycee', ['school-a', 'aucun']),
    );
    const view = parseInscritsView(params);
    expect(view.facets.niveau).toEqual(['2nde', '1ere']);
    expect(view.facets.parcours).toEqual(['nouveau']);
    expect(view.facets.lycee).toEqual(['school-a', 'aucun']);
    expect(view.facets.genre).toEqual([]);
  });

  it('drops a facet emptied by its last value', () => {
    const params = written(
      inscritsFacetParams('genre', ['femme']),
      inscritsFacetParams('genre', []),
    );
    expect(params.has('genre')).toBe(false);
  });

  it('clears every facet but keeps the sort and the search', () => {
    const params = written(
      { q: 'lou' },
      inscritsSortParams('xp', 'desc'),
      inscritsFacetParams('genre', ['femme']),
      inscritsFacetParams('reco', ['option-1']),
      inscritsClearedFacetParams(),
    );
    expect(params.toString()).toBe('q=lou&sort=xp');
  });

  it('writes nothing for the default sort, and no direction a first click gives', () => {
    expect(written(inscritsSortParams('nom', 'asc')).toString()).toBe('');
    expect(written(inscritsSortParams('xp', 'desc')).toString()).toBe(
      'sort=xp',
    );
    expect(written(inscritsSortParams('nom', 'desc')).toString()).toBe(
      'sort=nom&dir=desc',
    );
  });

  it('reads a written sort back as itself', () => {
    for (const [sort, dir] of [
      ['xp', 'asc'],
      ['parcours', 'desc'],
      ['nom', 'desc'],
    ] as const) {
      const view = parseInscritsView(written(inscritsSortParams(sort, dir)));
      expect([view.sort, view.dir]).toEqual([sort, dir]);
    }
  });

  it('survives a hand-edited address', () => {
    const view = parseInscritsView(
      new URLSearchParams(
        'niveau=2nde,,2nde, 1ere&sort=nimporte&dir=haut&inconnu=1',
      ),
    );
    expect(view.facets.niveau).toEqual(['2nde', '1ere']);
    expect(view.sort).toBe('nom');
    expect(view.dir).toBe('asc');
  });
});
