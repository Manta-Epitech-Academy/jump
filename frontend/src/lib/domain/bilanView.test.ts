import { describe, it, expect } from 'vitest';
import {
  bilanClearedFacetParams,
  bilanFacetParams,
  bilanSortParams,
  parseBilanView,
} from './bilanView';
import { bilanFacets, matchesBilanFacets, type BilanRow } from './bilanRoster';

/**
 * The Feedback address is written by the page's header filters and by the
 * event home's recommendation card, which sends an option by its id. What has
 * to hold: a written view reads back as itself, the bare address is the whole
 * roster by nom, and an option the form no longer carries filters nothing
 * rather than emptying the list.
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

const options = [
  { id: 'yes', label: 'Oui' },
  { id: 'no', label: 'Non' },
];

const row = (talentId: string, recoOptionId: string | null): BilanRow => ({
  talentId,
  nom: talentId,
  prenom: 'Lou',
  respondedAt: recoOptionId ? '2026-10-01T10:00:00.000Z' : null,
  recoOptionId,
});

const rows = [row('a', 'yes'), row('b', 'no'), row('c', null)];

const kept = (params: URLSearchParams) => {
  const facets = bilanFacets(rows, options, parseBilanView(params));
  return rows
    .filter((r) => matchesBilanFacets(r, facets))
    .map((r) => r.talentId);
};

describe('the feedback view address', () => {
  it('reads the bare address as the whole roster, by nom', () => {
    const view = parseBilanView(new URLSearchParams());
    expect([view.sort, view.dir]).toEqual(['nom', 'asc']);
    expect(view.facets).toEqual({ reco: [], reponse: [] });
  });

  it('reads back an option, a response state and a sort as written', () => {
    const view = parseBilanView(
      written(
        bilanFacetParams('reco', ['yes', 'aucun']),
        bilanFacetParams('reponse', ['responded']),
        bilanSortParams('date', 'asc'),
      ),
    );
    expect(view.facets).toEqual({
      reco: ['yes', 'aucun'],
      reponse: ['responded'],
    });
    expect([view.sort, view.dir]).toEqual(['date', 'asc']);
  });

  it('writes nothing once its filters are cleared and its sort is the default', () => {
    expect(
      written(
        bilanFacetParams('reco', ['yes']),
        bilanClearedFacetParams(),
        bilanSortParams('nom', 'asc'),
      ).toString(),
    ).toBe('');
  });
});

describe('the feedback filters', () => {
  it('keep the talents who picked the option asked', () => {
    expect(kept(written(bilanFacetParams('reco', ['yes'])))).toEqual(['a']);
  });

  it('read `aucun` as no recommendation answer', () => {
    expect(kept(written(bilanFacetParams('reco', ['aucun'])))).toEqual(['c']);
  });

  it('ignore an option the form does not carry', () => {
    expect(kept(written(bilanFacetParams('reco', ['deleted'])))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
