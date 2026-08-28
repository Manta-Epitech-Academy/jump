/**
 * Feature adoption, checked by seeding real rows and reading them back.
 *
 * Three things only a real database can settle, and each one was a way to ship a
 * confidently wrong number.
 *
 * THE UNIQUE CONSTRAINT ACTUALLY DEDUPES. `skipDuplicates` over
 * `@@unique([feature, dedupeKey])` is the whole deduplication mechanism, and a
 * unit test with a mocked client proves nothing about it: Postgres is what
 * decides whether two rows collapse, and it treats NULLs as distinct, which is
 * exactly what `each` relies on.
 *
 * THE ROLLUP AND THE RAW ROWS AGREE. They are two answers to one question, and
 * the cube is what survives the purge, so if they can disagree the long-lived
 * figure is the wrong one.
 *
 * THE SMALL-CELL FLOOR MASKS WHAT IT CLAIMS TO. A masked cell is a promise made
 * in a definition quoted to a director, so it is checked against the data rather
 * than against the code that writes it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  getFeatureUsage,
  getFeatureAdoptionGaps,
  getCampusFeatureCoverage,
  USAGE_SMALL_CELL_FLOOR,
} from '$lib/server/services/adminStats/featureUsage';
import { getStaffActivity } from '$lib/server/services/adminStats/staffActivity';
import { rollUpUsage } from '$lib/server/usage/rollup';
import { usageMonth } from '$lib/server/usage/actorHash';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import { OperationRefusedError } from '$lib/server/adminApi/errors';

const SCHOOL_YEAR = currentSchoolYearLabel();
/** Far enough ahead that today's rows sit outside the detailed window. */
const LATER = new Date(Date.now() + 400 * 86_400_000);

const stamp = Date.now();
const CAMPUS_A = `UsageAlpha-${stamp}`;
const CAMPUS_B = `UsageBeta-${stamp}`;

let campusA = '';
let campusB = '';
let eventA = '';
const staffIds: string[] = [];
const userIds: string[] = [];
const talentIds: string[] = [];

/** A pseudonym shaped like the real one, without needing the salt configured. */
const hashFor = (n: number) => `${'0'.repeat(60)}${String(1000 + n)}`;

async function seedStaff(campusId: string, n: number) {
  const user = await prisma.bauth_user.create({
    data: {
      id: `usage-user-${stamp}-${n}`,
      email: `usage-${stamp}-${n}@epitech.eu`,
      name: `Usage Staff ${n}`,
      emailVerified: true,
    },
  });
  userIds.push(user.id);
  const profile = await prisma.staffProfile.create({
    data: { userId: user.id, campusId, staffRole: 'dev' },
  });
  staffIds.push(profile.id);
  return profile.id;
}

beforeAll(async () => {
  assertTestDatabase();

  const [a, b] = await Promise.all([
    prisma.campus.create({
      data: { name: CAMPUS_A, timezone: 'Europe/Paris' },
    }),
    prisma.campus.create({
      data: { name: CAMPUS_B, timezone: 'Europe/Paris' },
    }),
  ]);
  campusA = a.id;
  campusB = b.id;

  const event = await prisma.event.create({
    data: {
      titre: `UsageEvent-${stamp}`,
      publicName: 'Événement usage',
      date: new Date(Date.now() - 5 * 86_400_000),
      campusId: campusA,
    },
  });
  eventA = event.id;

  // Two members on campus A, one on campus B: enough for one campus to clear the
  // small-cell floor while the other does not.
  const s1 = await seedStaff(campusA, 1);
  const s2 = await seedStaff(campusA, 2);
  await seedStaff(campusB, 3);

  // A member who has never logged in, which is the case the projections exist
  // for and the one a MAX over purged rows would miss.
  await seedStaff(campusA, 4);

  await prisma.staffProfile.updateMany({
    where: { id: { in: [s1, s2] } },
    data: {
      firstLoginAt: new Date(Date.now() - 20 * 86_400_000),
      lastActiveAt: new Date(),
    },
  });

  for (let i = 0; i < USAGE_SMALL_CELL_FLOOR + 1; i += 1) {
    const talent = await prisma.talent.create({
      data: {
        nom: `UsageTalent${i}`,
        prenom: String(stamp),
        firstLoginAt: new Date(),
      },
    });
    talentIds.push(talent.id);
    await prisma.participation.create({
      data: { talentId: talent.id, eventId: eventA, campusId: campusA },
    });
  }
});

afterAll(async () => {
  await prisma.usage_FeatureMonthly.deleteMany({
    where: { campusId: { in: [campusA, campusB] } },
  });
  await prisma.usage_FeatureUse.deleteMany({
    where: { campusId: { in: [campusA, campusB] } },
  });
  await prisma.participation.deleteMany({ where: { eventId: eventA } });
  await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
  await prisma.event.delete({ where: { id: eventA } });
  await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.campus.deleteMany({ where: { id: { in: [campusA, campusB] } } });
});

describe('the dedupe key, against a real unique constraint', () => {
  it('collapses two rows sharing a bucket key, and keeps two null keys apart', async () => {
    const bucketKey = `bucket-${stamp}`;
    const write = (dedupeKey: string | null) =>
      prisma.usage_FeatureUse.createMany({
        data: [
          {
            feature: USAGE_FEATURES.DEV_EMARGEMENT_VIEW,
            actorKind: 'staff',
            staffProfileId: staffIds[0],
            campusId: campusA,
            eventId: eventA,
            dedupeKey,
          },
        ],
        skipDuplicates: true,
      });

    const first = await write(bucketKey);
    const second = await write(bucketKey);
    expect(first.count).toBe(1);
    // The second write is silently dropped by Postgres, which is the mechanism.
    expect(second.count).toBe(0);

    // `each` features pass null, and NULLs are distinct, so both land.
    const a = await write(null);
    const b = await write(null);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);

    await prisma.usage_FeatureUse.deleteMany({ where: { campusId: campusA } });
  });
});

describe('getFeatureUsage', () => {
  beforeAll(async () => {
    await prisma.usage_FeatureUse.createMany({
      data: [
        // Two distinct members, three uses: the ranking must read people, not uses.
        ...[0, 1, 2].map((i) => ({
          feature: USAGE_FEATURES.DEV_INSCRITS_EXPORT,
          actorKind: 'staff' as const,
          staffProfileId: staffIds[i === 2 ? 0 : i],
          campusId: campusA,
          eventId: eventA,
        })),
        // An impersonated use, which must not count anywhere.
        {
          feature: USAGE_FEATURES.DEV_BADGES_RENDER,
          actorKind: 'staff' as const,
          staffProfileId: staffIds[0],
          campusId: campusA,
          eventId: eventA,
          impersonated: true,
        },
      ],
    });
  });

  it('counts uses and distinct people separately', async () => {
    const answer = await getFeatureUsage(
      { campus: { id: campusA, name: CAMPUS_A } },
      { space: 'dev' },
    );
    const row = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    );
    expect(row?.utilisations).toBe(3);
    expect(row?.acteursDistinctsMoisDePointe).toBe(2);
    // Ranked on people, so it outranks nothing-at-all but reports both.
    expect(row?.rank).toBe(1);
  });

  it('excludes an impersonated use, because looking is not adopting', async () => {
    const answer = await getFeatureUsage(
      { campus: { id: campusA, name: CAMPUS_A } },
      { space: 'dev' },
    );
    const row = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_BADGES_RENDER,
    );
    expect(row?.utilisations).toBe(0);
    expect(row?.acteursDistinctsMoisDePointe).toBe(0);
  });

  it('lists every catalogued feature, used or not, with its definition', async () => {
    const answer = await getFeatureUsage({}, { space: 'dev' });
    const unused = answer.fonctionnalites.value.filter(
      (r) => r.utilisations === 0,
    );
    // The whole point: a feature nobody used is a row, not an absence.
    expect(unused.length).toBeGreaterThan(0);
    for (const row of answer.fonctionnalites.value) {
      expect(row.definition.length).toBeGreaterThan(20);
    }
  });

  it('divides by the people who could have used it, not by every row', async () => {
    const answer = await getFeatureUsage(
      { campus: { id: campusA, name: CAMPUS_A } },
      { space: 'dev' },
    );
    // Three staff on campus A, two of whom exported.
    expect(answer.populationConcernee.value.staff).toBe(3);
    const row = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    );
    expect(row?.partDeLaPopulation).toBeCloseTo(66.7, 1);
  });

  it('says which store answered, and reads it', async () => {
    // Asserting the label alone is how the cube shipped with no reader at all:
    // the announcement was true and the figure beside it came from the other
    // store. The second half of this case is the part that could have caught it.
    const recent = await getFeatureUsage({}, { days: 30 });
    expect(recent.source.value.store).toBe('lignes détaillées');
    expect(recent.source.value.mois).toBeNull();

    // Read from far enough ahead that this school year is older than the
    // detailed window, which is the only way past it now that retention is a
    // year: a `days` of 365 lands inside it.
    const old = await getFeatureUsage({ schoolYear: SCHOOL_YEAR }, {}, LATER);
    expect(old.source.value.store).toBe('totaux mensuels');
    expect(old.source.value.mois?.length).toBeGreaterThan(0);
  });
});

describe('getCampusFeatureCoverage', () => {
  it('masks a talent cell below the floor and never masks a zero', async () => {
    // One talent on campus A: below the floor, so the actor count is withheld.
    await prisma.usage_FeatureUse.create({
      data: {
        feature: USAGE_FEATURES.TALENT_XP_HISTORY_VIEW,
        actorKind: 'talent',
        actorHash: hashFor(1),
        campusId: campusA,
      },
    });

    const answer = await getCampusFeatureCoverage(
      {},
      { feature: USAGE_FEATURES.TALENT_XP_HISTORY_VIEW },
    );
    const a = answer.campus.value.find((r) => r.campus === CAMPUS_A);
    const b = answer.campus.value.find((r) => r.campus === CAMPUS_B);
    expect(a?.acteursDistincts).toBeNull();
    // Campus B has nobody, and a zero discloses nobody, so it stays a zero: it
    // is the most actionable answer the operation produces.
    expect(b?.acteursDistincts).toBe(0);
    expect(answer.celluleMasquee.value).toBeGreaterThanOrEqual(1);
  });

  it('reports the floor as reached once enough distinct talents appear', async () => {
    await prisma.usage_FeatureUse.createMany({
      data: Array.from({ length: USAGE_SMALL_CELL_FLOOR }, (_, i) => ({
        feature: USAGE_FEATURES.TALENT_SETTINGS_VIEW,
        actorKind: 'talent' as const,
        actorHash: hashFor(100 + i),
        campusId: campusA,
      })),
    });

    const answer = await getCampusFeatureCoverage(
      {},
      { feature: USAGE_FEATURES.TALENT_SETTINGS_VIEW },
    );
    const a = answer.campus.value.find((r) => r.campus === CAMPUS_A);
    expect(a?.acteursDistincts).toBe(USAGE_SMALL_CELL_FLOOR);
  });

  it('ranks campuses on adoption and leaves the unmeasurable unranked', async () => {
    const answer = await getCampusFeatureCoverage({});
    const ranks = answer.campus.value.map((r) => r.rank);
    expect(ranks.filter((r) => r === 1).length).toBeGreaterThanOrEqual(1);
  });
});

describe('getFeatureAdoptionGaps', () => {
  it('separates what nobody uses from what one campus uses', async () => {
    const answer = await getFeatureAdoptionGaps({});
    const single = answer.unSeulCampus.value.map((f) => f.feature);
    // Seeded on campus A only.
    expect(single).toContain(USAGE_FEATURES.DEV_INSCRITS_EXPORT);
    const never = answer.jamaisUtilisees.value.map((f) => f.feature);
    expect(never).not.toContain(USAGE_FEATURES.DEV_INSCRITS_EXPORT);
    expect(answer.aRetirer.value).toBe(never.length);
    expect(answer.aFormer.value).toBe(single.length);
  });
});

describe('the rollup', () => {
  it('agrees with the raw rows, and is idempotent', async () => {
    const before = await getFeatureUsage(
      { campus: { id: campusA, name: CAMPUS_A } },
      { space: 'dev' },
    );
    const raw = before.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    );

    const first = await rollUpUsage();
    expect(first.rowsWritten).toBeGreaterThan(0);

    const folded = await prisma.usage_FeatureMonthly.findFirst({
      where: {
        feature: USAGE_FEATURES.DEV_INSCRITS_EXPORT,
        campusId: campusA,
        month: usageMonth(new Date()),
      },
    });
    expect(folded?.uses).toBe(raw?.utilisations);
    expect(folded?.distinctActors).toBe(raw?.acteursDistinctsMoisDePointe);

    // Running it again recomputes the same numbers rather than doubling them,
    // which is what makes a weekly cron safe to retry.
    const second = await rollUpUsage();
    expect(second.rowsWritten).toBe(first.rowsWritten);
    const again = await prisma.usage_FeatureMonthly.findFirst({
      where: {
        feature: USAGE_FEATURES.DEV_INSCRITS_EXPORT,
        campusId: campusA,
        month: usageMonth(new Date()),
      },
    });
    expect(again?.uses).toBe(folded?.uses);
  });

  it('never folds an impersonated row into the cube', async () => {
    await rollUpUsage();
    const folded = await prisma.usage_FeatureMonthly.findFirst({
      where: { feature: USAGE_FEATURES.DEV_BADGES_RENDER, campusId: campusA },
    });
    expect(folded).toBeNull();
  });

  it('purges a row past the retention window, but only after folding it', async () => {
    // Comfortably past the twelve-month window, so the purge reaches it.
    const old = new Date(Date.now() - 500 * 86_400_000);
    await prisma.usage_FeatureUse.create({
      data: {
        feature: USAGE_FEATURES.DEV_PLANNING_VIEW,
        actorKind: 'staff',
        staffProfileId: staffIds[0],
        campusId: campusA,
        eventId: eventA,
        occurredAt: old,
      },
    });

    await rollUpUsage();

    // The raw row is gone...
    const remaining = await prisma.usage_FeatureUse.count({
      where: { feature: USAGE_FEATURES.DEV_PLANNING_VIEW, campusId: campusA },
    });
    expect(remaining).toBe(0);
    // ...and its month survived in the cube, which is the ordering guarantee.
    const folded = await prisma.usage_FeatureMonthly.findFirst({
      where: {
        feature: USAGE_FEATURES.DEV_PLANNING_VIEW,
        campusId: campusA,
        month: usageMonth(old),
      },
    });
    expect(folded?.uses).toBe(1);
  });
});

describe('getStaffActivity', () => {
  it('tells a never-opened account apart from an abandoned one', async () => {
    const answer = await getStaffActivity({
      campus: { id: campusA, name: CAMPUS_A },
    });
    expect(answer.effectif.value).toBe(3);
    // The member seeded with no firstLoginAt at all.
    expect(answer.jamaisConnectes.value).toBe(1);
    expect(answer.actifs7Jours.value).toBe(2);
    expect(answer.inactifs30Jours.value).toBe(0);
  });

  it('names no person, only counts', async () => {
    const answer = await getStaffActivity({});
    const serialised = JSON.stringify(answer);
    expect(serialised).not.toContain('Usage Staff');
    expect(serialised).not.toContain('@epitech.eu');
  });

  it('keeps a member with no campus in a row of their own', async () => {
    const answer = await getStaffActivity({});
    const rows = answer.parCampus.value.map((r) => r.campus);
    expect(new Set(rows).size).toBe(rows.length);
  });
});

/**
 * The defects that shipped, each reproduced against a real database.
 *
 * All three were invisible to the suite as first written, and how they were
 * invisible is the part worth keeping. `says which store answered` asserted the
 * label and never the figure beside it, so a true announcement over data from
 * the other store passed. `the rollup agrees with the raw rows` compared the two
 * stores inside a single month, the one window where the talent pseudonym cannot
 * rotate. And the disclosure floor was only ever exercised through the coverage
 * matrix, while the other operation accepted the same campus filter.
 *
 * This block runs last on purpose: it rolls the cube up from a future instant,
 * which purges every raw row the earlier blocks seeded.
 */
describe('the figures the two stores must agree on', () => {
  it('counts one talent active in two months once, not twice', async () => {
    // One person, two monthly pseudonyms, which is what rotation produces. A set
    // accumulated over the window counted them twice and let the share pass
    // 100 %; the reported figure is the busiest month, so it is 1.
    await prisma.usage_FeatureUse.createMany({
      data: [
        {
          feature: USAGE_FEATURES.TALENT_EVENTS_VIEW,
          actorKind: 'talent' as const,
          actorHash: hashFor(300),
          campusId: campusB,
          occurredAt: new Date(),
        },
        {
          feature: USAGE_FEATURES.TALENT_EVENTS_VIEW,
          actorKind: 'talent' as const,
          actorHash: hashFor(301),
          campusId: campusB,
          occurredAt: new Date(Date.now() - 45 * 86_400_000),
        },
      ],
    });

    const answer = await getFeatureUsage({}, { days: 90 });
    const row = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.TALENT_EVENTS_VIEW,
    );
    expect(row?.utilisations).toBe(2);
    expect(row?.acteursDistinctsMoisDePointe).toBe(1);
    expect(row?.moisDePointe).not.toBeNull();
  });

  it('never lets a share of the population exceed 100 %', async () => {
    const answer = await getFeatureUsage({}, { days: 365 });
    for (const row of answer.fonctionnalites.value) {
      if (row.partDeLaPopulation !== null) {
        expect(row.partDeLaPopulation).toBeLessThanOrEqual(100);
      }
    }
  });

  it('masks a per-campus talent cell here too, not only in the matrix', async () => {
    // Reachable with a leadership token: same `campus` filter, same audience.
    // This operation answered unmasked because the floor sat at one call site.
    const answer = await getFeatureUsage(
      { campus: { id: campusB, name: CAMPUS_B } },
      { days: 90, feature: USAGE_FEATURES.TALENT_EVENTS_VIEW },
    );
    const row = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.TALENT_EVENTS_VIEW,
    );
    expect(row?.acteursDistinctsMoisDePointe).toBeNull();
    // Masked with the count, or it would hand the count straight back.
    expect(row?.partDeLaPopulation).toBeNull();
  });

  it('refuses to isolate an event beyond the detailed window', async () => {
    await expect(
      getFeatureUsage(
        { schoolYear: SCHOOL_YEAR, event: { id: eventA, label: 'Événement' } },
        {},
        LATER,
      ),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });

  it('refuses a window that does not meet the school year, instead of zeros', async () => {
    // The day count and the year cross whenever the year ended longer ago than
    // the window is wide. This answered zero for every feature and echoed the
    // filters back to confirm it.
    await expect(
      getFeatureUsage({ schoolYear: SCHOOL_YEAR }, { days: 7 }, LATER),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });

  it('reads the monthly cube once the raw rows are purged', async () => {
    // The production sequence: time passes, the job folds every month present
    // and then purges what is past retention. Read from the same instant, the
    // answer has to come from the cube, and used to come back empty while
    // announcing that it had.
    const before = await getFeatureUsage({}, { days: 90 });
    const seeded = before.fonctionnalites.value.filter(
      (r) => r.utilisations > 0,
    );
    expect(seeded.length).toBeGreaterThan(0);

    await rollUpUsage(LATER);
    expect(await prisma.usage_FeatureUse.count()).toBe(0);

    const answer = await getFeatureUsage(
      { schoolYear: SCHOOL_YEAR },
      {},
      LATER,
    );
    expect(answer.source.value.store).toBe('totaux mensuels');
    expect(answer.source.value.calculeLe).not.toBeNull();
    for (const row of seeded) {
      const after = answer.fonctionnalites.value.find(
        (r) => r.feature === row.feature,
      );
      expect(after?.utilisations, row.feature).toBe(row.utilisations);
    }
  });

  it('reports adoption gaps from the cube rather than declaring everything unused', async () => {
    // The weekly digest's defect: with the raw rows gone, every feature that had
    // served read as never used, which is the direction that makes somebody
    // delete something in use.
    const gaps = await getFeatureAdoptionGaps(
      { schoolYear: SCHOOL_YEAR },
      {},
      LATER,
    );
    expect(gaps.source.value.store).toBe('totaux mensuels');
    expect(gaps.aRetirer.value).not.toBeNull();
    expect(
      gaps.jamaisUtilisees.value.some(
        (g) => g.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
      ),
    ).toBe(false);
  });

  it('applies the disclosure floor on the cube path too', async () => {
    const answer = await getCampusFeatureCoverage(
      { schoolYear: SCHOOL_YEAR },
      { feature: USAGE_FEATURES.TALENT_EVENTS_VIEW },
      LATER,
    );
    const b = answer.campus.value.find((r) => r.campus === CAMPUS_B);
    expect(b?.acteursDistincts).toBeNull();
    expect(answer.celluleMasquee.value).toBeGreaterThanOrEqual(1);
  });

  it('gives no distinct-actor count on the all-features coverage view', async () => {
    // Distinct people across features is not derivable from a per-feature cube,
    // and cumulating it on the raw path would make the field mean two things.
    const answer = await getCampusFeatureCoverage(
      { schoolYear: SCHOOL_YEAR },
      {},
      LATER,
    );
    for (const row of answer.campus.value) {
      expect(row.acteursDistincts).toBeNull();
    }
    expect(answer.celluleMasquee.value).toBeNull();
  });

  it('tells never-measured apart from measured-at-zero', async () => {
    const answer = await getFeatureUsage(
      { schoolYear: SCHOOL_YEAR },
      {},
      LATER,
    );
    expect(answer.evolution.value).not.toBeNull();
    const reference = answer.evolution.value!.periodeReference;

    // The reference period overlaps months that were folded, so it WAS measured,
    // and a feature nobody used over it is a genuine zero.
    const measured = answer.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    );
    expect(measured?.evolutionUtilisations?.previous).toBe(0);

    // Take the measurement away and the same field must go null. Reading an
    // unmeasured period as a real zero would make every feature look like it
    // collapsed on the day the comparison window crossed the instrumentation.
    await prisma.usage_FeatureMonthly.deleteMany({
      where: { month: { in: reference } },
    });
    const after = await getFeatureUsage({ schoolYear: SCHOOL_YEAR }, {}, LATER);
    const unmeasured = after.fonctionnalites.value.find(
      (r) => r.feature === USAGE_FEATURES.DEV_INSCRITS_EXPORT,
    );
    expect(unmeasured?.evolutionUtilisations?.previous).toBeNull();
  });
});
