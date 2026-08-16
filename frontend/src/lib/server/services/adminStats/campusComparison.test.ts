/**
 * The ranking rules, which are the whole reason this aggregate exists: if the
 * order or the null handling is wrong, a consumer reads a campus as last when the
 * platform simply cannot measure it, which is worse than not answering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';

const listAdminEvents = vi.fn();
vi.mock('$lib/server/services/events', () => ({
  EventService: { listAdminEvents: () => listAdminEvents() },
}));

const participationFindMany = vi.fn();
const talentFindMany = vi.fn();
vi.mock('$lib/server/db', () => ({
  prisma: {
    participation: { findMany: (args: unknown) => participationFindMany(args) },
    talent: { findMany: (args: unknown) => talentFindMany(args) },
  },
}));

const { getCampusComparison } = await import('./campusComparison');
const { WOMEN_SHARE_RULE } = await import('./cohortProfile');
const { SHOW_UP_RATE_RULE } = await import('./attendanceRate');

function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    campusName: 'Lille',
    campusId: 'campus_lille',
    schoolYearLabel: '2025-2026',
    status: 'past',
    participations: 0,
    modules: [],
    ...over,
  } as AdminEventVM;
}

type Enrolment = { talentId: string; eventId: string; sfMemberStatus: string };
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
}) {
  listAdminEvents.mockResolvedValue(options.events);
  participationFindMany.mockResolvedValue(options.enrolments);
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
