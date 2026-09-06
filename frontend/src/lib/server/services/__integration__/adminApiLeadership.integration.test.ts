/**
 * The leadership figures that compare things, on real SQL.
 *
 * The unit tests for the campus comparison mock Prisma, which proves the ranking
 * rules and nothing about the queries under them; and a churn or a year-on-year
 * gap cannot be exercised at all on a single-event fixture. Both are figures a
 * directeur général quotes out loud, and both are new, so they get a fixture with
 * two school years and three campuses and are checked on the numbers.
 *
 * The three campuses are deliberately uneven: one busy, one only in the earlier
 * year, one with an event and nobody. The last is the interesting case - it must
 * come back as a ranked zero rather than disappear, and its unmeasurable rate must
 * come back unranked rather than last.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { assertTestDatabase } from './testDatabase';
import { getCampusComparison } from '$lib/server/services/adminStats/campusComparison';
import { getSchoolChurn } from '$lib/server/services/adminStats/schoolChurn';
import { getSchoolYearReview } from '$lib/server/services/adminStats/schoolYearReview';
import { getSchoolsReach } from '$lib/server/services/adminStats/schoolsReach';

const stamp = Date.now();
const TZ = 'Europe/Paris';
/** Bare campus names; the seeded ones carry the stamp. */
const BUSY = 'Busy';
const EARLIER = 'Earlier';
const EMPTY = 'Empty';

const campusName = (base: string) => `Verif${base}-${stamp}`;

describe('the comparing leadership figures (integration)', () => {
  const campusIds = new Map<string, string>();
  const schoolIds: string[] = [];
  let currentYear = '';
  let previousYear = '';

  beforeAll(async () => {
    assertTestDatabase();

    for (const base of [BUSY, EARLIER, EMPTY]) {
      const campus = await prisma.campus.create({
        data: { name: campusName(base), timezone: TZ },
      });
      campusIds.set(base, campus.id);
    }

    const school = async (name: string, index: number) =>
      prisma.school.create({
        data: {
          uai: `VER${stamp}${index}`,
          name: `${name} ${stamp}`,
          // A Nord postal code, so the reach roll-up has a real département and
          // académie to attribute the lycée to.
          postalCode: '59000',
          city: 'Lille',
        },
      });
    const [kept, lost, gained] = await Promise.all([
      school('Lycee Kept', 0),
      school('Lycee Lost', 1),
      school('Lycee New', 2),
    ]);
    schoolIds.push(kept.id, lost.id, gained.id);

    // Dates are fixed, not derived from the clock: a school year label computed
    // from "now" would move every 31 July and the assertions below are about two
    // specific years.
    const event = (base: string, year: number) =>
      prisma.event.create({
        data: {
          titre: `Verif-${base}-${year}-${stamp}`,
          date: new Date(`${year}-11-15T09:00:00Z`),
          endDate: new Date(`${year}-11-16T17:00:00Z`),
          campusId: campusIds.get(base)!,
        },
      });

    const talent = async (over: {
      civilite?: string;
      schoolId?: string;
      complete?: boolean;
    }) => {
      const done = over.complete ? new Date() : null;
      return prisma.talent.create({
        data: {
          nom: `VerifNom-${stamp}`,
          prenom: 'VerifPrenom',
          civilite: over.civilite ?? null,
          schoolId: over.schoolId ?? null,
          infoValidatedAt: done,
          highSchoolValidatedAt: done,
          parentsValidatedAt: done,
          techInterestsValidatedAt: done,
          generalInterestsValidatedAt: done,
          equipmentValidatedAt: done,
          processingCompletedAt: done,
          rulesSignedAt: done,
          charterAcceptedAt: done,
        },
      });
    };

    const enrol = (
      talentId: string,
      event: { id: string; campusId: string },
      sfMemberStatus: string,
    ) =>
      prisma.participation.create({
        data: {
          talentId,
          eventId: event.id,
          campusId: event.campusId,
          sfMemberStatus,
        },
      });

    // Earlier year: the busy campus runs two events and one talent attends both,
    // another signs up through the lycée that will later go quiet.
    const busyEarlyA = await event(BUSY, 2024);
    const busyEarlyB = await event(BUSY, 2024);
    const earlierOnly = await event(EARLIER, 2024);
    previousYear = schoolYearOf(busyEarlyA.date, TZ).label;

    const returning = await talent({
      civilite: 'femme',
      schoolId: kept.id,
      complete: true,
    });
    await enrol(returning.id, busyEarlyA, 'MEET');
    await enrol(returning.id, busyEarlyB, 'MEET');

    const fromLostSchool = await talent({
      civilite: 'homme',
      schoolId: lost.id,
    });
    await enrol(fromLostSchool.id, busyEarlyA, 'READY');

    const elsewhere = await talent({ civilite: 'femme', schoolId: kept.id });
    await enrol(elsewhere.id, earlierOnly, 'MEET');

    // Current year: the busy campus keeps one lycée and gains another, the empty
    // campus has an event nobody signed up to, the earlier campus has none at all.
    const busyNow = await event(BUSY, 2025);
    await event(EMPTY, 2025);
    currentYear = schoolYearOf(busyNow.date, TZ).label;

    for (const civilite of ['femme', 'femme', 'homme']) {
      const t = await talent({ civilite, schoolId: kept.id, complete: true });
      await enrol(t.id, busyNow, 'MEET');
    }
    const fromNewSchool = await talent({
      civilite: 'homme',
      schoolId: gained.id,
    });
    await enrol(fromNewSchool.id, busyNow, 'READY');
  });

  afterAll(async () => {
    try {
      const ids = [...campusIds.values()];
      await prisma.participation.deleteMany({
        where: { campusId: { in: ids } },
      });
      await prisma.talent.deleteMany({ where: { prenom: 'VerifPrenom' } });
      await prisma.event.deleteMany({ where: { campusId: { in: ids } } });
      await prisma.campus.deleteMany({ where: { id: { in: ids } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  /** The seeded campuses only: the DB may hold others from a previous run. */
  const seeded = (
    rows: { campus: string; value: number | null; rank: number | null }[],
  ) => rows.filter((row) => row.campus.endsWith(String(stamp)));
  const forCampus = (
    rows: { campus: string; value: number | null; rank: number | null }[],
    base: string,
  ) => rows.find((row) => row.campus === campusName(base));

  describe('getCampusComparison', () => {
    it('counts a distinct cohort per campus and ranks it', async () => {
      const { rankings } = await getCampusComparison({
        schoolYear: currentYear,
      });
      const rows = seeded(rankings.cohort.value);

      // Three talents who came plus one who signed up and did not: the cohort is
      // everyone enrolled, not everyone present.
      expect(forCampus(rows, BUSY)?.value).toBe(4);
      // An event with nobody is a true zero, still ranked and still named. The
      // campus with no event this year is absent, which is a different statement.
      expect(forCampus(rows, EMPTY)?.value).toBe(0);
      expect(forCampus(rows, EMPTY)?.rank).not.toBeNull();
      expect(forCampus(rows, EARLIER)).toBeUndefined();
    });

    it('measures the share of women over known civilités', async () => {
      const { rankings } = await getCampusComparison({
        schoolYear: currentYear,
      });
      // Two women out of four known civilités on the busy campus.
      expect(forCampus(seeded(rankings.womenShare.value), BUSY)?.value).toBe(
        50,
      );
    });

    it('rates show-up on concluded statuses, and leaves an unmeasurable one unranked', async () => {
      const { rankings } = await getCampusComparison({
        schoolYear: currentYear,
      });
      const rows = seeded(rankings.showUpRate.value);

      // Three MEET against one READY.
      expect(forCampus(rows, BUSY)?.value).toBe(75);
      // The empty campus has a past event and no enrolment: nothing to rate.
      expect(forCampus(rows, EMPTY)?.value).toBeNull();
      expect(forCampus(rows, EMPTY)?.rank).toBeNull();
      for (const row of rows) {
        expect(row.value === null).toBe(row.rank === null);
      }
    });

    it('counts the lycées a campus reaches, and who came back', async () => {
      const current = await getCampusComparison({ schoolYear: currentYear });
      // Three talents from one lycée, one from another.
      expect(
        forCampus(seeded(current.rankings.schools.value), BUSY)?.value,
      ).toBe(2);
      // Nobody enrolled twice this year.
      expect(
        forCampus(seeded(current.rankings.returningShare.value), BUSY)?.value,
      ).toBe(0);

      // The earlier year is where the returning talent is: one of three.
      const earlier = await getCampusComparison({ schoolYear: previousYear });
      expect(
        forCampus(seeded(earlier.rankings.returningShare.value), BUSY)?.value,
      ).toBe(50);
    });
  });

  describe('getSchoolChurn', () => {
    it('names the lycée that stopped sending anyone and the one that started', async () => {
      const churn = await getSchoolChurn(
        { campus: { id: campusIds.get(BUSY)!, name: campusName(BUSY) } },
        { schoolYear: currentYear, compareTo: previousYear },
      );

      expect(churn.retained.value).toBe(1);
      expect(churn.gained.value).toBe(1);
      expect(churn.lost.value).toBe(1);
      expect(churn.retainedShare.value).toBe(50);
      expect(churn.lostSchools.value[0].name).toContain('Lycee Lost');
      // The row carries what was lost, which is the order to win them back in.
      expect(churn.lostSchools.value[0].talents).toBe(1);
      expect(churn.gainedSchools.value[0].name).toContain('Lycee New');
    });

    it('refuses a year with no event rather than reporting everything as new', async () => {
      await expect(
        getSchoolChurn({}, { schoolYear: currentYear, compareTo: '2099-2100' }),
      ).rejects.toThrow('2099-2100');
    });
  });

  describe('getSchoolsReach', () => {
    it('rolls the same lycées up to their académie', async () => {
      const reach = await getSchoolsReach({
        campus: { id: campusIds.get(BUSY)!, name: campusName(BUSY) },
        schoolYear: currentYear,
      });

      expect(reach.byDepartement.value).toContainEqual(
        expect.objectContaining({ departement: '59' }),
      );
      expect(reach.byAcademie.value).toContainEqual(
        expect.objectContaining({ academie: 'Lille', schools: 2 }),
      );
    });
  });

  describe('getSchoolYearReview with compareTo', () => {
    it('returns each movement computed, counts with a relative gap and rates without', async () => {
      const review = await getSchoolYearReview(
        {
          campus: { id: campusIds.get(BUSY)!, name: campusName(BUSY) },
          schoolYear: currentYear,
        },
        { compareTo: previousYear },
      );

      expect(review.comparaison).not.toBeNull();
      const comparison = review.comparaison!;

      // 4 talents against 2: the gap and its growth both arrive computed.
      expect(comparison.cohort.talents.value).toMatchObject({
        previous: 2,
        absolute: 2,
        relative: 100,
      });
      // A rate moves in points and never carries a relative change.
      expect(comparison.cohort.womenShare.value.relative).toBeNull();
      expect(comparison.cohort.womenShare.value.previous).toBe(50);
      expect(comparison.reach.schools.value.absolute).toBe(0);
      expect(comparison.schoolYear).toBe(previousYear);
    });

    it('states the in-progress-year trap only when a comparison was asked for', async () => {
      const compared = await getSchoolYearReview(
        { schoolYear: currentYear },
        { compareTo: previousYear },
      );
      const alone = await getSchoolYearReview({ schoolYear: currentYear });

      expect(compared.limites.some((l) => l.includes('encore en cours'))).toBe(
        true,
      );
      expect(alone.comparaison).toBeNull();
      expect(alone.limites.some((l) => l.includes('encore en cours'))).toBe(
        false,
      );
    });
  });
});
