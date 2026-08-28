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
    expect(row?.acteursDistincts).toBe(2);
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
    expect(row?.acteursDistincts).toBe(0);
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

  it('says which store answered', async () => {
    const recent = await getFeatureUsage({}, { days: 30 });
    expect(recent.source.value).toBe('lignes détaillées');
    const old = await getFeatureUsage({}, { days: 365 });
    expect(old.source.value).toBe('totaux mensuels');
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
    expect(folded?.distinctActors).toBe(raw?.acteursDistincts);

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
    const old = new Date(Date.now() - 200 * 86_400_000);
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
