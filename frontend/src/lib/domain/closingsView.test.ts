import { describe, it, expect } from 'vitest';
import {
  closingsFilterParams,
  closingsSortParams,
  matchesClosingsView,
  parseClosingsView,
} from './closingsView';

/**
 * The Closings address is written by the page's own filters and by the event
 * home's cards, which send a finalised verdict as `statut=done&avis=…`. What has
 * to hold: a written view reads back as itself, the bare address is the whole
 * roster by nom, a hand-edited address cannot break the read, and the filter
 * keeps exactly the closings the home counted.
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

describe('the closings view address', () => {
  it('reads the bare address as the whole roster, by nom', () => {
    expect(parseClosingsView(new URLSearchParams())).toEqual({
      statut: null,
      avis: null,
      sort: 'nom',
      dir: 'asc',
    });
  });

  it('reads back a status, a verdict and a sort as written', () => {
    const view = parseClosingsView(
      written(
        closingsFilterParams({ statut: 'done', avis: 'bon_profil' }),
        closingsSortParams('date', 'desc'),
      ),
    );
    expect(view).toEqual({
      statut: 'done',
      avis: 'bon_profil',
      sort: 'date',
      dir: 'desc',
    });
  });

  it('writes nothing for the default view', () => {
    expect(
      written(
        closingsFilterParams({ statut: null, avis: null }),
        closingsSortParams('nom', 'asc'),
      ).toString(),
    ).toBe('');
  });

  it('ignores values it does not know', () => {
    const view = parseClosingsView(
      new URLSearchParams('statut=abandoned&avis=maybe&sort=xp&dir=up'),
    );
    expect(view).toEqual({
      statut: null,
      avis: null,
      sort: 'nom',
      dir: 'asc',
    });
  });
});

describe('a row against the view', () => {
  const done = { status: 'done', recommendation: 'bon_profil' } as const;
  const doneNoVerdict = { status: 'done', recommendation: null } as const;
  const todo = { status: 'todo', recommendation: null } as const;

  it('keeps the closings of the status asked', () => {
    const view = { statut: 'done', avis: null } as const;
    expect(matchesClosingsView(done, view)).toBe(true);
    expect(matchesClosingsView(todo, view)).toBe(false);
  });

  it('reads `aucun` as a closing carrying no verdict', () => {
    const view = { statut: 'done', avis: 'aucun' } as const;
    expect(matchesClosingsView(doneNoVerdict, view)).toBe(true);
    expect(matchesClosingsView(done, view)).toBe(false);
  });
});
