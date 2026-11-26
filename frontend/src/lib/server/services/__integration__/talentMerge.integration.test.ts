import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '#lib/server/db.ts';
import { schoolYearOf } from '#lib/domain/schoolYear.ts';
import { assertTestDatabase } from './testDatabase';
import { mergeTalents } from '../talentMergeService';

/**
 * Where both records of one person hold the same fact, the merge keeps one:
 * the survivor's, since it is the record the talent and the staff have read.
 * `talentScopedData` proves every row moves when nothing collides; this proves
 * what happens when something does, and that the XP ledger neither pays a
 * fact twice nor loses one.
 */
describe('mergeTalents (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  let survivorId = '';
  let absorbedId = '';
  const badgeKeys = [
    `merge-absorbed-first-${stamp}`,
    `merge-survivor-first-${stamp}`,
  ];
  const earlier = new Date('2026-03-04T10:00:00.000Z');
  const later = new Date('2026-09-14T10:00:00.000Z');

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Merge ${stamp}` } })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Coding club',
          campusId,
          date: new Date('2026-10-24T12:00:00.000Z'),
        },
      })
    ).id;
    const talent = (label: string) =>
      prisma.talent.create({
        data: {
          externalId: `merge-${label}-${stamp}`,
          prenom: 'Charlie',
          nom: 'Test',
        },
      });
    survivorId = (await talent('survivor')).id;
    absorbedId = (await talent('absorbed')).id;

    // Both enrolled in the same campaign, with different Salesforce statuses.
    await prisma.participation.createMany({
      data: [
        { talentId: survivorId, eventId, campusId, sfMemberStatus: 'READY' },
        { talentId: absorbedId, eventId, campusId, sfMemberStatus: 'MET' },
      ],
    });
    // Staff marked the absorbed record present, and the survivor absent, on
    // the same half-day; and the absorbed record alone on the afternoon.
    const day = new Date('2026-10-24T00:00:00.000Z');
    await prisma.eventPresence.createMany({
      data: [
        {
          talentId: survivorId,
          eventId,
          day,
          slot: 'morning',
          status: 'absent',
        },
        {
          talentId: absorbedId,
          eventId,
          day,
          slot: 'morning',
          status: 'present',
        },
        {
          talentId: absorbedId,
          eventId,
          day,
          slot: 'afternoon',
          status: 'present',
        },
      ],
    });
    await prisma.xpGrant.createMany({
      data: [
        // The same workshop fact on both records: paid once.
        {
          talentId: survivorId,
          source: 'workshop',
          sourceId: `ctf:${survivorId}`,
          amount: 50,
        },
        {
          talentId: absorbedId,
          source: 'workshop',
          sourceId: `ctf:${absorbedId}`,
          amount: 50,
        },
        // A fact only the absorbed record earned: kept, keyed on the survivor.
        {
          talentId: absorbedId,
          source: 'onboarding',
          sourceId: absorbedId,
          amount: 100,
        },
      ],
    });
    // Only the absorbed record was synced this school year: its schooling
    // becomes the survivor's, and so does the niveau it projects.
    await prisma.schooling_YearRecord.create({
      data: {
        talentId: absorbedId,
        schoolYear: schoolYearOf(new Date(), 'Europe/Paris').label,
        niveau: 'terminale',
        source: 'sync',
      },
    });
    // Two badges both records earned: one the absorbed record earned first,
    // one the survivor did. Either way the person earned it on the earlier day.
    for (const key of badgeKeys) {
      await prisma.badge_Definition.create({
        data: {
          key,
          label: key,
          condition: 'Test',
          groupKey: 'wtf',
          shape: 'circle',
          icon: 'check',
          backgroundColor: '#013afb',
          ringColor: '#ffffff',
          iconColor: '#ffffff',
          counterKey: 'xp',
          threshold: 1,
        },
      });
    }
    await prisma.badge_Award.createMany({
      data: [
        { talentId: survivorId, badgeKey: badgeKeys[0], awardedAt: later },
        { talentId: absorbedId, badgeKey: badgeKeys[0], awardedAt: earlier },
        { talentId: survivorId, badgeKey: badgeKeys[1], awardedAt: earlier },
        { talentId: absorbedId, badgeKey: badgeKeys[1], awardedAt: later },
      ],
    });

    await prisma.$transaction((tx) =>
      mergeTalents(tx, survivorId, [absorbedId]),
    );
  });

  afterAll(async () => {
    // The awards go with the talents (cascade), so the badges can go after.
    await prisma.talent.deleteMany({
      where: { id: { in: [survivorId, absorbedId] } },
    });
    await prisma.badge_Definition.deleteMany({
      where: { key: { in: badgeKeys } },
    });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it("keeps the survivor's enrolment where both were enrolled", async () => {
    expect(
      await prisma.participation.findMany({
        where: { eventId },
        select: { talentId: true, sfMemberStatus: true },
      }),
    ).toEqual([{ talentId: survivorId, sfMemberStatus: 'READY' }]);
  });

  it("keeps the survivor's mark on a shared half-day and moves the others", async () => {
    expect(
      await prisma.eventPresence.findMany({
        where: { eventId },
        // Enum order: morning, then afternoon.
        orderBy: { slot: 'asc' },
        select: { talentId: true, slot: true, status: true },
      }),
    ).toEqual([
      { talentId: survivorId, slot: 'morning', status: 'absent' },
      { talentId: survivorId, slot: 'afternoon', status: 'present' },
    ]);
  });

  it('pays a fact once and keys every grant on the survivor', async () => {
    expect(
      await prisma.xpGrant.findMany({
        where: { talentId: survivorId },
        orderBy: { source: 'asc' },
        select: { source: true, sourceId: true, amount: true },
      }),
    ).toEqual([
      { source: 'onboarding', sourceId: survivorId, amount: 100 },
      { source: 'workshop', sourceId: `ctf:${survivorId}`, amount: 50 },
    ]);
  });

  it('keeps a badge both earned once, on the earlier of the two days', async () => {
    expect(
      await prisma.badge_Award.findMany({
        where: { badgeKey: { in: badgeKeys } },
        orderBy: { badgeKey: 'asc' },
        select: { talentId: true, badgeKey: true, awardedAt: true },
      }),
    ).toEqual([
      { talentId: survivorId, badgeKey: badgeKeys[0], awardedAt: earlier },
      { talentId: survivorId, badgeKey: badgeKeys[1], awardedAt: earlier },
    ]);
  });

  it('recomputes the projections the survivor now holds', async () => {
    expect(
      await prisma.talent.findUniqueOrThrow({
        where: { id: survivorId },
        select: { xp: true, eventsCount: true, niveau: true },
      }),
    ).toEqual({ xp: 150, eventsCount: 1, niveau: 'terminale' });
  });
});
