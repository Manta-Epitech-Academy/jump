import { describe, it, expect } from 'vitest';
import {
  closingsClearedFacetParams,
  closingsFacetParams,
  closingsSortParams,
  parseClosingsView,
} from './closingsView';
import {
  closingsFacets,
  matchesClosingsFacets,
  type ClosingRow,
} from './closingsRoster';

/**
 * The Closings address is written by the page's header filters and by the
 * event home's cards, which send a verdict as `avis=…` and the finalised
 * closings without one as `statut=done&avis=aucun`.
 * What has to hold: a written view reads back as itself, the bare address is
 * the whole roster by nom, and the list keeps exactly the closings the home
 * counted.
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
  row({ talentId: 'c', status: 'in_progress', recommendation: 'bon_profil' }),
  row({ talentId: 'd' }),
];

const kept = (params: URLSearchParams) => {
  const facets = closingsFacets(rows, parseClosingsView(params));
  return rows
    .filter((r) => matchesClosingsFacets(r, facets))
    .map((r) => r.talentId);
};

describe('the closings view address', () => {
  it('reads the bare address as the whole roster, by nom', () => {
    const view = parseClosingsView(new URLSearchParams());
    expect(view.sort).toBe('nom');
    expect(view.dir).toBe('asc');
    expect(view.facets).toEqual({ mene: [], statut: [], avis: [] });
  });

  it('reads back several values of several facets and a sort as written', () => {
    const view = parseClosingsView(
      written(
        closingsFacetParams('statut', ['done', 'in_progress']),
        closingsFacetParams('avis', ['bon_profil']),
        closingsSortParams('date', 'asc'),
      ),
    );
    expect(view.facets.statut).toEqual(['done', 'in_progress']);
    expect(view.facets.avis).toEqual(['bon_profil']);
    expect([view.sort, view.dir]).toEqual(['date', 'asc']);
  });

  it('writes nothing once its filters are cleared and its sort is the default', () => {
    expect(
      written(
        closingsFacetParams('mene', ['s1']),
        closingsClearedFacetParams(),
        closingsSortParams('nom', 'asc'),
      ).toString(),
    ).toBe('');
  });
});

describe('the closings filters', () => {
  it('keep the finalised closings of one verdict, as the home counts them', () => {
    // `c` carries the same recommendation, picked mid-closing: no verdict yet.
    expect(kept(written(closingsFacetParams('avis', ['bon_profil'])))).toEqual([
      'a',
    ]);
  });

  it('read `aucun` as a closing nobody conducted, or one without a verdict', () => {
    expect(kept(written(closingsFacetParams('mene', ['aucun'])))).toEqual([
      'c',
      'd',
    ]);
    expect(
      kept(
        written(
          closingsFacetParams('statut', ['done']),
          closingsFacetParams('avis', ['aucun']),
        ),
      ),
    ).toEqual(['b']);
  });

  it('ignore a value the roster does not carry', () => {
    expect(kept(written(closingsFacetParams('mene', ['gone'])))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});
