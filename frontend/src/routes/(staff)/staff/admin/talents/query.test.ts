import { describe, it, expect } from 'vitest';
import { buildOrderBy, buildTalentWhere } from './query';
import { parseTalentFilters } from './view';

describe('buildOrderBy', () => {
  it('puts never active first when the oldest leads, and last on the way back', () => {
    // The one nullable column here whose absent rows do NOT sink in both
    // directions. "Jamais" is the far end of the axis, not a missing value, so
    // one click groups every talent nobody has seen log in at the top. The
    // members directory orders the same way, and there the same rule replaced a
    // filter tile outright.
    expect(buildOrderBy('activite', 'asc')[0]).toEqual({
      lastActiveAt: { sort: 'asc', nulls: 'first' },
    });
    expect(buildOrderBy('activite', 'desc')[0]).toEqual({
      lastActiveAt: { sort: 'desc', nulls: 'last' },
    });
  });

  it('sorts the bare address most recently active first, so a junk sort param cannot break the page', () => {
    // The list and the XLSX export share this function precisely so they cannot
    // drift, which is why the baseline is asserted rather than assumed.
    for (const query of ['', 'sort=niveau&dir=haut']) {
      const { sort, dir } = parseTalentFilters(new URLSearchParams(query));
      expect(buildOrderBy(sort, dir)).toEqual([
        { lastActiveAt: { sort: 'desc', nulls: 'last' } },
        { nom: 'asc' },
      ]);
    }
  });
});

describe('buildTalentWhere', () => {
  const where = (query: string) =>
    buildTalentWhere(parseTalentFilters(new URLSearchParams(query)));

  it('widens within a facet and narrows across facets', () => {
    // "Onboardé ou jamais connecté, parent en attente": one OR per facet, both
    // under the same AND, so neither facet can clobber the other.
    const { where: w } = where('statut=active,never&parent=pending');
    const clauses = (w.AND ?? []) as { OR?: unknown[] }[];
    expect(clauses.map((c) => c.OR?.length)).toEqual([2, 1]);
  });

  it('keeps the breakdown facets out of the scope the KPI tiles count', () => {
    const { scopeWhere } = where(
      'niveau=2nde,1ere&statut=never&parent=pending',
    );
    expect(scopeWhere).toEqual({
      AND: [{ OR: [{ niveau: { in: ['2nde', '1ere'] } }] }],
    });
  });

  it('keeps the talents with no niveau under « Non renseigné »', () => {
    // `aucun` is the only way to reach them: dropping it would answer the menu's
    // « Non renseigné » with an empty list.
    expect(where('niveau=aucun').scopeWhere).toEqual({
      AND: [{ OR: [{ niveau: null }] }],
    });
    expect(where('niveau=2nde,aucun').scopeWhere).toEqual({
      AND: [{ OR: [{ niveau: { in: ['2nde'] } }, { niveau: null }] }],
    });
  });
});
