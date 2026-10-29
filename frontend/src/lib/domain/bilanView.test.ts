import { describe, it, expect } from 'vitest';
import { BILAN_VIEW } from './bilanView';
import { bilanFacets, matchesBilanFacets, type BilanRow } from './bilanRoster';

/**
 * The Feedback address is written by the page's header filters and by the
 * event home's recommendation card, which sends an option by its id. What has
 * to hold: an option the form no longer carries filters nothing rather than
 * emptying the list. The address format itself is pinned once, in
 * `listView.test.ts`.
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
  const facets = bilanFacets(rows, options, BILAN_VIEW.parse(params));
  return rows
    .filter((r) => matchesBilanFacets(r, facets))
    .map((r) => r.talentId);
};

describe('the feedback filters', () => {
  it('keep the talents who picked the option asked', () => {
    expect(kept(written(BILAN_VIEW.facetParams('reco', ['yes'])))).toEqual([
      'a',
    ]);
  });

  it('read `aucun` as no recommendation answer', () => {
    expect(kept(written(BILAN_VIEW.facetParams('reco', ['aucun'])))).toEqual([
      'c',
    ]);
  });

  it('ignore an option the form does not carry', () => {
    expect(kept(written(BILAN_VIEW.facetParams('reco', ['deleted'])))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
