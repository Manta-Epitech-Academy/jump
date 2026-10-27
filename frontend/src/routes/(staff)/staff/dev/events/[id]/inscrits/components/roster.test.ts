import { describe, it, expect } from 'vitest';
import { parseInscritsView } from '$lib/domain/inscritsView';
import { niveauLabel } from '$lib/domain/niveau';
import {
  matchesFacets,
  rosterFacets,
  type RosterContext,
  type RosterFacet,
} from './roster';
import type { InscritRow } from './types';

/**
 * The Inscrits filters, checked against a small cohort. What a dev relies on:
 * ticking two values of one filter keeps either, combining two filters keeps
 * both, each value counts the whole event however the list is narrowed, an
 * address can never filter on a value the event does not carry, and a filter
 * whose data the event lacks is not offered at all.
 */

function row(over: Partial<InscritRow> & { id: string }): InscritRow {
  return {
    talentId: over.id,
    nom: over.id,
    prenom: 'Lou',
    civilite: null,
    niveau: null,
    schoolId: null,
    schoolName: null,
    xp: 0,
    priorEnrolments: 0,
    techInterests: [],
    status: 'ready',
    connected: true,
    rulesStatus: 'signed',
    imageStatus: 'accepted',
    studentSigned: true,
    email: null,
    sfMemberStatus: 'READY',
    ...over,
  };
}

const ia = { id: 'ia', nom: 'IA', emoji: null };
const cyber = { id: 'cyber', nom: 'Cyber', emoji: null };

const cohort = [
  row({ id: 'a', niveau: '2nde', civilite: 'femme', techInterests: [ia] }),
  row({
    id: 'b',
    niveau: '2nde',
    civilite: 'homme',
    priorEnrolments: 2,
    techInterests: [ia, cyber],
  }),
  row({ id: 'c', niveau: '1ere', civilite: 'femme', priorEnrolments: 5 }),
  row({
    id: 'd',
    niveau: null,
    civilite: 'femme',
    schoolId: 's1',
    schoolName: 'Pasteur',
  }),
];

const full: RosterContext = { showStatut: true };

function kept(query: string, ctx: RosterContext = full): string[] {
  const facets = rosterFacets(
    cohort,
    ctx,
    parseInscritsView(new URLSearchParams(query)),
  );
  return cohort.filter((r) => matchesFacets(r, facets)).map((r) => r.id);
}

function facet(facets: RosterFacet[], key: string): RosterFacet | undefined {
  return facets.find((f) => f.facet === key);
}

describe('the inscrits filters', () => {
  it('keeps an inscrit carrying any of the values ticked in one filter', () => {
    expect(kept('niveau=2nde,1ere')).toEqual(['a', 'b', 'c']);
    expect(kept('tech=cyber,ia')).toEqual(['a', 'b']);
  });

  it('keeps only the inscrits satisfying every active filter', () => {
    expect(kept('niveau=2nde&genre=femme')).toEqual(['a']);
    expect(kept('parcours=nouveau&genre=femme')).toEqual(['a', 'd']);
  });

  it('finds the inscrits with a field left blank', () => {
    expect(kept('niveau=aucun')).toEqual(['d']);
    expect(kept('tech=aucun')).toEqual(['c', 'd']);
  });

  it('counts each value over the whole cohort, whatever else is ticked', () => {
    const view = parseInscritsView(new URLSearchParams('genre=homme'));
    const niveau = facet(rosterFacets(cohort, full, view), 'niveau');
    expect(niveau?.options).toEqual([
      { value: '2nde', label: niveauLabel('2nde'), count: 2 },
      { value: '1ere', label: niveauLabel('1ere'), count: 1 },
      { value: 'aucun', label: 'Non renseigné', count: 1 },
    ]);
  });

  it('offers only the values some inscrit carries', () => {
    const facets = rosterFacets(
      cohort,
      full,
      parseInscritsView(new URLSearchParams()),
    );
    expect(facet(facets, 'genre')?.options.map((o) => o.value)).toEqual(
      ['homme', 'femme', 'aucun'].filter((v) => v !== 'aucun'),
    );
    expect(facet(facets, 'parcours')?.options.map((o) => o.value)).toEqual([
      'nouveau',
      '2',
      '3-et-plus',
    ]);
  });

  it('ignores an address value the cohort does not carry', () => {
    expect(kept('lycee=disparu')).toEqual(['a', 'b', 'c', 'd']);
    expect(kept('lycee=disparu,s1')).toEqual(['d']);
  });

  it('offers no filter that a single value fills, and ignores its param', () => {
    const sameLevel = [
      row({ id: 'p', niveau: '2nde' }),
      row({ id: 'q', niveau: '2nde' }),
    ];
    const view = parseInscritsView(new URLSearchParams('niveau=2nde'));
    const niveau = facet(rosterFacets(sameLevel, full, view), 'niveau');
    expect(niveau?.options).toEqual([]);
    expect(niveau?.selected).toEqual([]);
  });

  it('does not offer, nor apply, the statut where the campus does not onboard', () => {
    const ctx: RosterContext = { showStatut: false };
    const facets = rosterFacets(
      cohort,
      ctx,
      parseInscritsView(new URLSearchParams()),
    );
    expect(facet(facets, 'statut')).toBeUndefined();
    expect(kept('statut=never_connected', ctx)).toEqual(['a', 'b', 'c', 'd']);
  });
});
