import { describe, it, expect } from 'vitest';
import { defineListView } from './listView';

/**
 * A list's address is a contract with whoever writes it: the page's own
 * filters, a link pasted by a colleague, a card that opens the list filtered.
 * What has to hold, for every list: a written view reads back as itself, the
 * bare address is the unfiltered list in its default order, and nothing a
 * hand-edited address carries can break the read.
 */

const FACETS = ['genre', 'parcours', 'tech', 'lycee', 'niveau'] as const;

const VIEW = defineListView({
  facets: FACETS,
  sort: {
    firstDir: { prenom: 'asc', nom: 'asc', xp: 'desc' },
    defaultKey: 'nom',
  },
});

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

describe('a sorted list view address', () => {
  it('reads the bare address as the unfiltered list, by nom', () => {
    const view = VIEW.parse(new URLSearchParams());
    expect(view.sort).toBe('nom');
    expect(view.dir).toBe('asc');
    for (const facet of FACETS) expect(view.facets[facet]).toEqual([]);
  });

  it('reads back several values of several facets as written', () => {
    const params = written(
      VIEW.facetParams('niveau', ['2nde', '1ere']),
      VIEW.facetParams('parcours', ['nouveau']),
      VIEW.facetParams('lycee', ['school-a', 'aucun']),
    );
    const view = VIEW.parse(params);
    expect(view.facets.niveau).toEqual(['2nde', '1ere']);
    expect(view.facets.parcours).toEqual(['nouveau']);
    expect(view.facets.lycee).toEqual(['school-a', 'aucun']);
    expect(view.facets.genre).toEqual([]);
  });

  it('drops a facet emptied by its last value', () => {
    const params = written(
      VIEW.facetParams('genre', ['femme']),
      VIEW.facetParams('genre', []),
    );
    expect(params.has('genre')).toBe(false);
  });

  it('clears every facet but keeps the sort and the search', () => {
    const params = written(
      { q: 'lou' },
      VIEW.sortParams('xp', 'desc'),
      VIEW.facetParams('genre', ['femme']),
      VIEW.facetParams('tech', ['interest-1']),
      VIEW.clearedFacetParams(),
    );
    expect(params.toString()).toBe('q=lou&sort=xp');
  });

  it('writes nothing for the default sort, and no direction a first click gives', () => {
    expect(written(VIEW.sortParams('nom', 'asc')).toString()).toBe('');
    expect(written(VIEW.sortParams('xp', 'desc')).toString()).toBe('sort=xp');
    expect(written(VIEW.sortParams('nom', 'desc')).toString()).toBe(
      'sort=nom&dir=desc',
    );
  });

  it('reads a written sort back as itself', () => {
    for (const [sort, dir] of [
      ['xp', 'asc'],
      ['prenom', 'desc'],
      ['nom', 'desc'],
    ] as const) {
      const view = VIEW.parse(written(VIEW.sortParams(sort, dir)));
      expect([view.sort, view.dir]).toEqual([sort, dir]);
    }
  });

  it('survives a hand-edited address', () => {
    const view = VIEW.parse(
      new URLSearchParams(
        'niveau=2nde,,2nde, 1ere&sort=nimporte&dir=haut&inconnu=1',
      ),
    );
    expect(view.facets.niveau).toEqual(['2nde', '1ere']);
    expect(view.sort).toBe('nom');
    expect(view.dir).toBe('asc');
  });
});

describe('a list view without a sort', () => {
  const UNSORTED = defineListView({ facets: ['canal', 'statut'] as const });

  it('reads its facets and nothing else', () => {
    const view = UNSORTED.parse(
      written(UNSORTED.facetParams('canal', ['mail']), { sort: 'nom' }),
    );
    expect(view).toEqual({ facets: { canal: ['mail'], statut: [] } });
  });
});
