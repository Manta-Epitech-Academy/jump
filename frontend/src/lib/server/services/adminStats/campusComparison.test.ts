/**
 * The ranking rules, which are the whole reason this aggregate exists: if the
 * order or the null handling is wrong, a consumer reads a campus as last when the
 * platform simply cannot measure it, which is worse than not answering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';

const listAdminEvents = vi.fn();
// Only the query is stubbed; the rest of the module stays real. The rule under
// the coverage denominator is read from there, so replacing the module wholesale
// would leave the closing tests below agreeing with a stub instead of with the
// gate.
vi.mock('$lib/server/services/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/services/events')>()),
  EventService: { listAdminEvents: () => listAdminEvents() },
}));

const participationFindMany = vi.fn();
const talentFindMany = vi.fn();
const closingFindMany = vi.fn();
vi.mock('$lib/server/db', () => ({
  prisma: {
    participation: { findMany: (args: unknown) => participationFindMany(args) },
    talent: { findMany: (args: unknown) => talentFindMany(args) },
    closing_Record: { findMany: (args: unknown) => closingFindMany(args) },
  },
}));

const { getCampusComparison } = await import('./campusComparison');
const { WOMEN_SHARE_RULE } = await import('./cohortProfile');
const { SHOW_UP_RATE_RULE } = await import('./attendanceRate');

/**
 * Both halves of the closing gate are spelled out, never defaulted.
 *
 * `closingTemplateId` was missing here, so it was `undefined`, and `undefined
 * !== ''` is true: every closing test below passed on the module half alone,
 * and the grid half - the one the coverage bug was actually about - was
 * unexercised.
 */
function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    campusName: 'Lille',
    campusId: 'campus_lille',
    schoolYearLabel: '2025-2026',
    status: 'past',
    participations: 0,
    modules: [],
    closingTemplateId: '',
    ...over,
  } as AdminEventVM;
}

type Enrolment = { talentId: string; eventId: string; sfMemberStatus: string };
type Closing = { eventId: string; recommendation: string | null };
type TalentRow = {
  id: string;
  civilite: string | null;
  schoolId: string | null;
};

/**
 * The two talent reads are told apart by their `select`: one asks for the profile
 * columns, the other only for the ids of those who finished sign-up.
 */
function seed(options: {
  events: AdminEventVM[];
  enrolments: Enrolment[];
  talents: TalentRow[];
  onboardingComplete?: string[];
  closings?: Closing[];
}) {
  listAdminEvents.mockResolvedValue(options.events);
  participationFindMany.mockResolvedValue(options.enrolments);
  closingFindMany.mockResolvedValue(
    (options.closings ?? []).map((c) => ({
      recommendation: c.recommendation,
      participation: { eventId: c.eventId },
    })),
  );
  talentFindMany.mockImplementation((args: { select: Record<string, true> }) =>
    Promise.resolve(
      'civilite' in args.select
        ? options.talents
        : (options.onboardingComplete ?? []).map((id) => ({ id })),
    ),
  );
}

beforeEach(() => {
  listAdminEvents.mockReset();
  participationFindMany.mockReset();
  talentFindMany.mockReset();
  closingFindMany.mockReset();
});

describe('getCampusComparison', () => {
  it('ranks a figure highest first, and counts every campus with an event', async () => {
    seed({
      events: [
        event({ id: 'lille', campusName: 'Lille' }),
        event({ id: 'nantes', campusName: 'Nantes' }),
        event({ id: 'nice', campusName: 'Nice' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'nantes', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'nantes', sfMemberStatus: 'MEET' },
        { talentId: 't3', eventId: 'nantes', sfMemberStatus: 'MEET' },
        { talentId: 't4', eventId: 'lille', sfMemberStatus: 'MEET' },
      ],
      talents: [],
    });

    const comparison = await getCampusComparison({ schoolYear: '2025-2026' });

    expect(comparison.campuses.value).toBe(3);
    expect(comparison.rankings.cohort.value).toEqual([
      { campus: 'Nantes', value: 3, rank: 1 },
      { campus: 'Lille', value: 1, rank: 2 },
      // A campus whose events drew nobody is a truthful zero, still ranked.
      { campus: 'Nice', value: 0, rank: 3 },
    ]);
  });

  it('gives tied campuses the same rank, so a tie never reads as an order', async () => {
    seed({
      events: [
        event({ id: 'a', campusName: 'Lille' }),
        event({ id: 'b', campusName: 'Nantes' }),
        event({ id: 'c', campusName: 'Nice' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'a', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'b', sfMemberStatus: 'MEET' },
      ],
      talents: [],
    });

    const { cohort } = (await getCampusComparison({ schoolYear: '2025-2026' }))
      .rankings;

    expect(
      cohort.value.map((row) => [row.campus, row.value, row.rank]),
    ).toEqual([
      ['Lille', 1, 1],
      ['Nantes', 1, 1],
      ['Nice', 0, 3],
    ]);
  });

  // The failure this prevents: a campus with no measurable rate sorted to the
  // bottom and stamped "last", which reads as the worst performer.
  it('puts an unmeasurable value last and leaves it unranked', async () => {
    seed({
      events: [
        event({ id: 'past', campusName: 'Lille', status: 'past' }),
        event({ id: 'soon', campusName: 'Nantes', status: 'upcoming' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'past', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'past', sfMemberStatus: 'READY' },
        { talentId: 't3', eventId: 'soon', sfMemberStatus: 'READY' },
      ],
      talents: [],
    });

    const { showUpRate } = (
      await getCampusComparison({ schoolYear: '2025-2026' })
    ).rankings;

    expect(showUpRate.value).toEqual([
      { campus: 'Lille', value: 50, rank: 1 },
      // Nantes' only event has not happened: nobody could have shown up yet.
      { campus: 'Nantes', value: null, rank: null },
    ]);
  });

  it('excludes a status that concludes nothing from the show-up denominator', async () => {
    seed({
      events: [event({ id: 'past', campusName: 'Lille' })],
      enrolments: [
        { talentId: 't1', eventId: 'past', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'past', sfMemberStatus: 'READY' },
        // Imported before Jump recorded the status: not an absence.
        { talentId: 't3', eventId: 'past', sfMemberStatus: '' },
      ],
      talents: [],
    });

    const { showUpRate } = (
      await getCampusComparison({ schoolYear: '2025-2026' })
    ).rankings;

    expect(showUpRate.value[0]).toEqual({
      campus: 'Lille',
      value: 50,
      rank: 1,
    });
  });

  it('computes the share of women on the campus, over known civilités only', async () => {
    seed({
      events: [event({ id: 'a', campusName: 'Lille' })],
      enrolments: [
        { talentId: 't1', eventId: 'a', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'a', sfMemberStatus: 'MEET' },
        { talentId: 't3', eventId: 'a', sfMemberStatus: 'MEET' },
      ],
      talents: [
        { id: 't1', civilite: 'femme', schoolId: 's1' },
        { id: 't2', civilite: 'homme', schoolId: 's1' },
        // Unknown civilité is out of the denominator, not counted as a man.
        { id: 't3', civilite: null, schoolId: null },
      ],
    });

    const { womenShare, schools } = (
      await getCampusComparison({ schoolYear: '2025-2026' })
    ).rankings;

    expect(womenShare.value[0].value).toBe(50);
    // Two talents share one lycée, the third has none identified.
    expect(schools.value[0].value).toBe(1);
  });

  it('counts a talent on every campus they enrolled in', async () => {
    seed({
      events: [
        event({ id: 'a', campusName: 'Lille' }),
        event({ id: 'b', campusName: 'Nantes' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'a', sfMemberStatus: 'MEET' },
        { talentId: 't1', eventId: 'b', sfMemberStatus: 'MEET' },
      ],
      talents: [{ id: 't1', civilite: 'femme', schoolId: null }],
    });

    const { cohort, returningShare } = (
      await getCampusComparison({ schoolYear: '2025-2026' })
    ).rankings;

    expect(cohort.value.every((row) => row.value === 1)).toBe(true);
    // Came once per campus, so "revenu" is false on both: returning is measured
    // inside a campus, not across them.
    expect(returningShare.value.every((row) => row.value === 0)).toBe(true);
  });

  it('states each rule from the service that owns it, not a local copy', async () => {
    seed({ events: [event()], enrolments: [], talents: [] });

    const { rankings } = await getCampusComparison({ schoolYear: '2025-2026' });

    expect(rankings.womenShare.definition).toContain(WOMEN_SHARE_RULE);
    expect(rankings.showUpRate.definition).toContain(SHOW_UP_RATE_RULE);
    // And every ranking explains its own axis, including the unranked nulls.
    for (const ranking of Object.values(rankings)) {
      expect(ranking.definition).toContain('null');
    }
  });

  it('refuses a school year no event falls in, rather than ranking zeros', async () => {
    seed({ events: [event()], enrolments: [], talents: [] });

    await expect(
      getCampusComparison({ schoolYear: '2099-2100' }),
    ).rejects.toThrow('2025-2026');
  });
});

/**
 * The two closing axes, and specifically their nulls.
 *
 * These are the figures the recette had to rebuild by hand from fifteen calls,
 * and the trap they carry is the one this file exists for: a campus that ran no
 * closing must not read as a campus whose profiles are all unsuitable.
 */
describe('getCampusComparison, closing axes', () => {
  const withClosings = (over: Partial<AdminEventVM>) =>
    event({ modules: ['closings'], closingTemplateId: 'clt', ...over });

  it('takes coverage over the events that run closings, not the whole cohort', async () => {
    seed({
      events: [
        withClosings({ id: 'lille-stage', campusName: 'Lille' }),
        // Same campus, no grid: its enrolments are a configuration fact and
        // must not dilute the rate.
        event({ id: 'lille-club', campusName: 'Lille' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'lille-stage', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'lille-stage', sfMemberStatus: 'MEET' },
        { talentId: 't3', eventId: 'lille-club', sfMemberStatus: 'MEET' },
        { talentId: 't4', eventId: 'lille-club', sfMemberStatus: 'MEET' },
      ],
      talents: [],
      closings: [{ eventId: 'lille-stage', recommendation: 'bon_profil' }],
    });

    const comparison = await getCampusComparison({ schoolYear: '2025-2026' });

    // 1 of the 2 concerned enrolments, not 1 of 4.
    expect(comparison.rankings.closingCoverage.value).toEqual([
      { campus: 'Lille', value: 50, rank: 1 },
    ]);
  });

  it('leaves out an event whose section is on but which names no grid', async () => {
    seed({
      events: [
        withClosings({ id: 'lille-stage', campusName: 'Lille' }),
        // Configured enough to look ready, holding no grid and therefore no
        // closing: its enrolments belong to the configuration gap, not to the
        // rate.
        event({
          id: 'lille-sans-grille',
          campusName: 'Lille',
          modules: ['closings'],
        }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'lille-stage', sfMemberStatus: 'MEET' },
        {
          talentId: 't2',
          eventId: 'lille-sans-grille',
          sfMemberStatus: 'MEET',
        },
      ],
      talents: [],
      closings: [{ eventId: 'lille-stage', recommendation: 'bon_profil' }],
    });

    const comparison = await getCampusComparison({ schoolYear: '2025-2026' });

    // 1 of the 1 concerned enrolment, not 1 of 2.
    expect(comparison.rankings.closingCoverage.value).toEqual([
      { campus: 'Lille', value: 100, rank: 1 },
    ]);
  });

  it('reads a campus that conducted no closing as unmeasured, never as zero', async () => {
    seed({
      events: [
        withClosings({ id: 'lille', campusName: 'Lille' }),
        event({ id: 'rennes', campusName: 'Rennes' }),
      ],
      enrolments: [
        { talentId: 't1', eventId: 'lille', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'rennes', sfMemberStatus: 'MEET' },
      ],
      talents: [],
      closings: [{ eventId: 'lille', recommendation: 'tres_compatible' }],
    });

    const comparison = await getCampusComparison({ schoolYear: '2025-2026' });

    expect(comparison.rankings.closingCoverage.value).toEqual([
      { campus: 'Lille', value: 100, rank: 1 },
      { campus: 'Rennes', value: null, rank: null },
    ]);
    expect(comparison.rankings.favourableVerdictShare.value).toEqual([
      { campus: 'Lille', value: 100, rank: 1 },
      { campus: 'Rennes', value: null, rank: null },
    ]);
  });

  it('shares the favourable verdicts against the verdicts given, not every closing', async () => {
    seed({
      events: [withClosings({ id: 'nantes', campusName: 'Nantes' })],
      enrolments: [
        { talentId: 't1', eventId: 'nantes', sfMemberStatus: 'MEET' },
        { talentId: 't2', eventId: 'nantes', sfMemberStatus: 'MEET' },
        { talentId: 't3', eventId: 'nantes', sfMemberStatus: 'MEET' },
      ],
      talents: [],
      closings: [
        { eventId: 'nantes', recommendation: 'tres_compatible' },
        { eventId: 'nantes', recommendation: 'indecis' },
        // Still open: no verdict yet, and counting it would read as a bad one.
        { eventId: 'nantes', recommendation: null },
      ],
    });

    const comparison = await getCampusComparison({ schoolYear: '2025-2026' });

    expect(comparison.rankings.favourableVerdictShare.value).toEqual([
      { campus: 'Nantes', value: 50, rank: 1 },
    ]);
  });
});
