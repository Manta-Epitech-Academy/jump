/**
 * "La cohorte du périmètre" is one population at every scope, including no scope.
 *
 * `cohort.ts` exists so that every aggregate counts the same people, and every
 * definition it ships says which: the enrolments Jump shows. The unfiltered case
 * used to be exempt - an empty scope short-circuited to "every `Talent` row" -
 * and the difference is not theoretical, because two mechanisms produce talents
 * with no visible enrolment on their own:
 *
 *   - the worker syncs every campaign member whatever its status, so a `désisté`
 *     talent has a row and a participation `visibleParticipationWhere` excludes;
 *   - dropping somebody from a Salesforce campaign deletes the participation and
 *     keeps the talent (`syncService`'s prune), leaving a talent enrolled nowhere.
 *
 * Both were counted by an unfiltered answer and by no scoped one, under a French
 * definition stating the opposite, on the tier whose reader quotes definitions
 * instead of re-deriving them. Checked on real SQL because the contract IS a
 * Prisma filter, and asserted over the seeded ids rather than as totals, since the
 * integration database is shared with the other suites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { assertTestDatabase } from './testDatabase';
import { resolveScope } from '$lib/server/adminApi/scope';
import { cohortWhere } from '$lib/server/services/adminStats/cohort';
import { getOnboardingFunnel } from '$lib/server/services/adminStats/onboardingFunnel';

const stamp = Date.now();
const CAMPUS = `CohortCampus-${stamp}`;
const TIMEZONE = 'Europe/Paris';

describe('the cohort in scope (integration)', () => {
  let campusId = '';
  let eventId = '';
  /** The year the seeded event falls in, not the year today falls in. */
  let schoolYear = '';
  /** The three shapes a talent can have with respect to a visible enrolment. */
  const ids = { shown: '', withdrawn: '', unenrolled: '' };

  beforeAll(async () => {
    assertTestDatabase();

    const campus = await prisma.campus.create({
      data: { name: CAMPUS, timezone: TIMEZONE },
    });
    campusId = campus.id;

    const event = await prisma.event.create({
      data: {
        titre: `CohortEvent-${stamp}`,
        publicName: 'Événement de test',
        date: new Date(Date.now() - 10 * 86_400_000),
        endDate: new Date(Date.now() - 9 * 86_400_000),
        campusId,
      },
    });
    eventId = event.id;
    schoolYear = schoolYearOf(event.date, TIMEZONE).label;

    const talent = async (key: keyof typeof ids, status: string | null) => {
      const row = await prisma.talent.create({
        data: { nom: `Cohort-${key}`, prenom: String(stamp) },
      });
      ids[key] = row.id;
      if (status !== null) {
        await prisma.participation.create({
          data: { talentId: row.id, eventId, campusId, sfMemberStatus: status },
        });
      }
    };

    await talent('shown', 'MEET');
    await talent('withdrawn', 'DESISTED');
    // No participation at all: what the campaign prune leaves behind.
    await talent('unenrolled', null);
  });

  afterAll(async () => {
    try {
      await prisma.participation.deleteMany({ where: { eventId } });
      await prisma.talent.deleteMany({
        where: { id: { in: Object.values(ids) } },
      });
      await prisma.event.deleteMany({ where: { id: eventId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  /** Which of the three seeded talents a scope selects. */
  const selected = async (scope: Parameters<typeof cohortWhere>[0]) => {
    const rows = await prisma.talent.findMany({
      where: {
        AND: [await cohortWhere(scope), { id: { in: Object.values(ids) } }],
      },
      select: { id: true },
    });
    const found = new Set(rows.map((row) => row.id));
    return Object.entries(ids)
      .filter(([, id]) => found.has(id))
      .map(([key]) => key)
      .sort();
  };

  it('counts only the talents Jump shows when a campus is named', async () => {
    expect(await selected(await resolveScope({ campus: CAMPUS }))).toEqual([
      'shown',
    ]);
  });

  // The regression. Before, this returned all three: a désisté talent and a
  // talent enrolled nowhere were in the platform-wide figure and in no other.
  it('counts the same population when no filter is passed at all', async () => {
    expect(await selected({})).toEqual(['shown']);
  });

  // A different code path from the two above: the year narrows through the event
  // list `scopedEvents` builds, not through a campus id, and the withdrawn talent
  // is enrolled in an event that year.
  it('counts the same population when only a school year is named', async () => {
    expect(await selected({ schoolYear })).toEqual(['shown']);
  });

  // The other half of the fix: the funnel used to word its cohort differently on
  // an empty scope ("tous les talents enregistrés dans Jump"), because that is
  // what the short-circuit made it count. One population, one sentence.
  it('states the same definition filtered and unfiltered', async () => {
    const [scoped, unscoped] = await Promise.all([
      getOnboardingFunnel(await resolveScope({ campus: CAMPUS })),
      getOnboardingFunnel(),
    ]);

    expect(unscoped.cohort.definition).toBe(scoped.cohort.definition);
    expect(unscoped.cohort.definition).toContain('READY ou MEET');
  });
});
