import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
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

    await prisma.$transaction((tx) =>
      mergeTalents(tx, survivorId, [absorbedId]),
    );
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({
      where: { id: { in: [survivorId, absorbedId] } },
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

  it('recomputes the projections the survivor now holds', async () => {
    expect(
      await prisma.talent.findUniqueOrThrow({
        where: { id: survivorId },
        select: { xp: true, eventsCount: true },
      }),
    ).toEqual({ xp: 150, eventsCount: 1 });
  });
});
