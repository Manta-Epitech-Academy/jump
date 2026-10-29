import { describe, it, expect } from 'vitest';
import { CLOSINGS_VIEW } from './closingsView';
import {
  closingsFacets,
  matchesClosingsFacets,
  type ClosingRow,
} from './closingsRoster';

/**
 * The Closings address is written by the page's header filters and by the
 * event home's cards, which send a verdict as `avis=…` and the finalised
 * closings without one as `statut=done&avis=aucun`.
 * What has to hold: the list keeps exactly the closings the home counted. The
 * address format itself is pinned once, in `listView.test.ts`.
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

function row(over: Partial<ClosingRow> & { talentId: string }): ClosingRow {
  return {
    nom: over.talentId,
    prenom: 'Lou',
    status: 'todo',
    staffId: null,
    staffName: null,
    staffImage: null,
    conductedAt: null,
    recommendation: null,
    ...over,
  };
}

const rows = [
  row({
    talentId: 'a',
    status: 'done',
    recommendation: 'bon_profil',
    staffId: 's1',
    staffName: 'Camille',
  }),
  row({ talentId: 'b', status: 'done', staffId: 's1', staffName: 'Camille' }),
  // A verdict picked mid-closing is not the team's conclusion yet.
  row({
    talentId: 'c',
    status: 'in_progress',
    recommendation: 'bon_profil',
    staffId: 's2',
    staffName: 'Sam',
  }),
  row({ talentId: 'd' }),
  // Finalised by a member whose account was deleted since (`staffId` nulled).
  row({ talentId: 'e', status: 'done' }),
];

const kept = (params: URLSearchParams) => {
  const facets = closingsFacets(rows, CLOSINGS_VIEW.parse(params));
  return rows
    .filter((r) => matchesClosingsFacets(r, facets))
    .map((r) => r.talentId);
};

describe('the closings filters', () => {
  it('keep the finalised closings of one verdict, as the home counts them', () => {
    // `c` carries the same recommendation, picked mid-closing: no verdict yet.
    expect(
      kept(written(CLOSINGS_VIEW.facetParams('avis', ['bon_profil']))),
    ).toEqual(['a']);
  });

  it('read `aucun` as a closing nobody conducted, or one without a verdict', () => {
    expect(kept(written(CLOSINGS_VIEW.facetParams('mene', ['aucun'])))).toEqual(
      ['d'],
    );
    expect(
      kept(
        written(
          CLOSINGS_VIEW.facetParams('statut', ['done']),
          CLOSINGS_VIEW.facetParams('avis', ['aucun']),
        ),
      ),
    ).toEqual(['b', 'e']);
  });

  it('file a closing whose conductor has left under them, never as not conducted', () => {
    expect(
      kept(written(CLOSINGS_VIEW.facetParams('mene', ['ancien']))),
    ).toEqual(['e']);
  });

  it('ignore a value the roster does not carry', () => {
    expect(kept(written(CLOSINGS_VIEW.facetParams('mene', ['gone'])))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});
