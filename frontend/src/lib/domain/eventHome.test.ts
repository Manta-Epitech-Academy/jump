import { describe, it, expect } from 'vitest';
import { eventHomeFigures, HOME_LINKS, type EventHomeInput } from './eventHome';
import { parseInscritsView } from './inscritsView';
import { matchesFacets, rosterFacets, type InscritRow } from './inscritsRoster';
import type { ClosingRow } from './closingsRoster';
import { tallyClosings } from './closingsRoster';

/**
 * The event home's cards, against the lists they open. What a dev relies on:
 * a part opens a list holding exactly the inscrits it counted (the « Autres »
 * fold included), an empty event says so rather than drawing empty charts, a
 * verdict counts only once its closing is finalised, and the XP card never
 * lists a talent who has none.
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

const empty: EventHomeInput = { rows: [], closings: null, feedback: null };

/** The rows the Inscrits page keeps for a part's link. */
function opened(rows: InscritRow[], params: Record<string, string>) {
  const view = parseInscritsView(new URLSearchParams(params));
  const facets = rosterFacets(rows, { showStatut: true }, view);
  return rows.filter((r) => matchesFacets(r, facets));
}

describe('an event with nobody enrolled', () => {
  it('draws no part, no bar and nobody', () => {
    const figures = eventHomeFigures(empty);
    expect(figures.total).toBe(0);
    expect(figures.niveau).toEqual([]);
    expect(figures.genre).toEqual([]);
    expect(figures.lycees).toEqual([]);
    expect(figures.tech).toEqual([]);
    expect(figures.returning).toEqual([]);
    expect(figures.topXp).toEqual([]);
    expect(figures.closings).toBeNull();
    expect(figures.feedback).toEqual({ kind: 'no-form' });
  });
});

describe('the niveau ring', () => {
  const niveaux = ['2nde', '2nde', '1ere', 'terminale', 'bac_1', 'bac_2'];
  const rows = [
    ...niveaux.map((niveau, i) => row({ id: `n${i}`, niveau })),
    row({ id: 'blank' }),
  ];

  it('folds the tail into « Autres », which opens all of it', () => {
    const parts = eventHomeFigures({ ...empty, rows }).niveau;
    expect(parts.map((p) => p.key)).toEqual([
      '2nde',
      '1ere',
      'terminale',
      'autres',
      'aucun',
    ]);
    const autres = parts.find((p) => p.key === 'autres')!;
    expect(autres.count).toBe(2);
    expect(opened(rows, autres.link.params)).toHaveLength(2);
  });

  it('opens on each part exactly the inscrits it counted', () => {
    for (const part of eventHomeFigures({ ...empty, rows }).niveau)
      expect(opened(rows, part.link.params)).toHaveLength(part.count);
  });

  it('keeps a cohort of one niveau as a single part', () => {
    const one = [
      row({ id: 'a', niveau: '2nde' }),
      row({ id: 'b', niveau: '2nde' }),
    ];
    const parts = eventHomeFigures({ ...empty, rows: one }).niveau;
    expect(parts).toHaveLength(1);
    expect(parts[0].share).toBe('100 %');
  });
});

describe('the talent rankings', () => {
  it('lists XP highest first, never a talent with none', () => {
    const rows = [
      row({ id: 'a', xp: 0 }),
      row({ id: 'b', xp: 1250 }),
      row({ id: 'c', xp: 300 }),
    ];
    const { topXp } = eventHomeFigures({ ...empty, rows });
    expect(topXp.map((t) => t.talentId)).toEqual(['b', 'c']);
    expect(topXp[0].detail).toBe('1\u202f250');
  });

  it('lists the parcours furthest along, newcomers left out', () => {
    const rows = [
      row({ id: 'new', priorEnrolments: 0 }),
      row({ id: 'third', priorEnrolments: 2 }),
      row({ id: 'second', priorEnrolments: 1 }),
    ];
    const { returning } = eventHomeFigures({ ...empty, rows });
    expect(returning.map((t) => [t.talentId, t.detail])).toEqual([
      ['third', '3ᵉ inscription'],
      ['second', '2ᵉ inscription'],
    ]);
    expect(opened(rows, HOME_LINKS.returning.params)).toHaveLength(2);
  });
});

describe('the closings cards', () => {
  const closing = (over: Partial<ClosingRow> & { talentId: string }) =>
    ({
      nom: over.talentId,
      prenom: 'Lou',
      status: 'todo',
      staffName: null,
      staffImage: null,
      conductedAt: null,
      recommendation: null,
      ...over,
    }) satisfies ClosingRow;
  const rows = [
    closing({ talentId: 'a', status: 'done', recommendation: 'bon_profil' }),
    closing({ talentId: 'b', status: 'done' }),
    // A verdict picked mid-closing is not the team's conclusion yet.
    closing({
      talentId: 'c',
      status: 'in_progress',
      recommendation: 'indecis',
    }),
    closing({ talentId: 'd' }),
  ];
  const roster = { rows, ...tallyClosings(rows), total: rows.length };

  it('counts a verdict only once finalised, and the finalised without one', () => {
    const { closings } = eventHomeFigures({ ...empty, closings: roster });
    expect(closings?.finalised).toBe(2);
    expect(closings?.verdicts.map((p) => [p.key, p.count, p.share])).toEqual([
      ['bon_profil', 1, '50 %'],
      ['aucun', 1, '50 %'],
    ]);
    expect(closings?.verdicts[0].link.params).toEqual({
      statut: 'done',
      avis: 'bon_profil',
    });
  });

  it('opens the progress parts on the Closings page by status', () => {
    const { closings } = eventHomeFigures({ ...empty, closings: roster });
    expect(
      closings?.progress.map((p) => [p.link.surface, p.link.params]),
    ).toEqual([
      ['closings', { statut: 'done' }],
      ['closings', { statut: 'in_progress' }],
      ['closings', { statut: 'todo' }],
    ]);
  });
});

describe('the recommendation card', () => {
  const options = [
    { id: 'yes', label: 'Oui' },
    { id: 'meh', label: 'Mitigé' },
    { id: 'no', label: 'Non' },
  ];

  it('says when the questionnaire does not ask the question', () => {
    const figures = eventHomeFigures({
      ...empty,
      feedback: { rows: [], respondedCount: 0, total: 3, recoOptions: null },
    });
    expect(figures.feedback).toEqual({ kind: 'no-reco' });
  });

  it('counts the answers per option, and the rate over the inscrits', () => {
    const figures = eventHomeFigures({
      ...empty,
      feedback: {
        rows: [
          { respondedAt: 'x', recoOptionId: 'yes' },
          { respondedAt: 'x', recoOptionId: 'yes' },
          { respondedAt: 'x', recoOptionId: 'no' },
          { respondedAt: 'x', recoOptionId: null },
          { respondedAt: null, recoOptionId: null },
        ],
        respondedCount: 4,
        total: 5,
        recoOptions: options,
      },
    });
    expect(figures.feedback).toMatchObject({
      kind: 'answers',
      responded: 4,
      rate: '80 %',
      answered: 3,
    });
    if (figures.feedback.kind !== 'answers') throw new Error('answers');
    expect(
      figures.feedback.parts.map((p) => [
        p.key,
        p.count,
        p.tone,
        p.link.params,
      ]),
    ).toEqual([
      ['yes', 2, 'blue', { reco: 'yes' }],
      // Coloured by its rank among the options, not among the picked ones.
      ['no', 1, 'tech', { reco: 'no' }],
    ]);
  });
});
