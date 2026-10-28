import { describe, it, expect } from 'vitest';
import {
  bilanFilterParams,
  bilanSortParams,
  matchesBilanView,
  parseBilanView,
} from './bilanView';

/**
 * The Feedback address is written by the page's own filters and by the event
 * home's recommendation card, which sends an option by its id. What has to hold:
 * a written view reads back as itself, the bare address is the whole roster by
 * nom, and an id the form no longer carries filters nothing rather than
 * emptying the list.
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

describe('the feedback view address', () => {
  it('reads the bare address as the whole roster, by nom', () => {
    expect(parseBilanView(new URLSearchParams())).toEqual({
      reponse: null,
      reco: null,
      sort: 'nom',
      dir: 'asc',
    });
  });

  it('reads back a response state, an option and a sort as written', () => {
    const view = parseBilanView(
      written(
        bilanFilterParams({ reponse: 'responded', reco: 'opt-yes' }),
        bilanSortParams('date', 'desc'),
      ),
    );
    expect(view).toEqual({
      reponse: 'responded',
      reco: 'opt-yes',
      sort: 'date',
      dir: 'desc',
    });
  });

  it('writes nothing for the default view', () => {
    expect(
      written(
        bilanFilterParams({ reponse: null, reco: null }),
        bilanSortParams('nom', 'asc'),
      ).toString(),
    ).toBe('');
  });
});

describe('a row against the view', () => {
  const known = new Set(['opt-yes', 'opt-no']);
  const yes = { respondedAt: '2026-10-01T10:00:00Z', recoOptionId: 'opt-yes' };
  const pending = { respondedAt: null, recoOptionId: null };

  it('keeps the talents who picked the option asked', () => {
    const view = { reponse: null, reco: 'opt-yes' };
    expect(matchesBilanView(yes, view, known)).toBe(true);
    expect(matchesBilanView(pending, view, known)).toBe(false);
  });

  it('reads `aucun` as no recommendation answer', () => {
    const view = { reponse: null, reco: 'aucun' };
    expect(matchesBilanView(pending, view, known)).toBe(true);
    expect(matchesBilanView(yes, view, known)).toBe(false);
  });

  it('ignores an option the form does not carry', () => {
    const view = { reponse: null, reco: 'opt-deleted' };
    expect(matchesBilanView(yes, view, known)).toBe(true);
    expect(matchesBilanView(pending, view, known)).toBe(true);
  });
});
