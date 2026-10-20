import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import { assertTestDatabase } from './testDatabase';

/**
 * The two operations the dev workspace calls through the campus-scoped client
 * on a cloistered model without a handler for them: they ran unscoped, which
 * reads as scoped at the call site. Neither leaked, because their callers had
 * already checked the event's campus, and that is luck, not construction.
 */
describe('scopedPrisma on a count and a closure lookup (integration)', () => {
  const stamp = Date.now();
  const day = new Date('2026-09-01T00:00:00.000Z');
  let campusId = '';
  let otherCampusId = '';
  let eventId = '';
  let talentId = '';

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Scope Campus ${stamp}` } })
    ).id;
    otherCampusId = (
      await prisma.campus.create({ data: { name: `Scope Other ${stamp}` } })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Scope Event',
          campusId,
          date: new Date('2026-09-01T09:00:00.000Z'),
        },
      })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Lou', nom: 'Scopée' } })
    ).id;
    await prisma.participation.create({
      data: { talentId, eventId, campusId },
    });
    await prisma.eventPresenceClosure.create({
      data: { eventId, day, slot: 'morning' },
    });
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.talent.deleteMany({ where: { id: talentId } });
    await prisma.campus.deleteMany({
      where: { id: { in: [campusId, otherCampusId] } },
    });
  });

  it("counts only the campus's own enrolments", async () => {
    const where = { talentId };
    expect(await scopedPrisma(campusId).participation.count({ where })).toBe(1);
    expect(
      await scopedPrisma(otherCampusId).participation.count({ where }),
    ).toBe(0);
  });

  it("refuses to look up another campus's closure", async () => {
    const where = {
      eventId_day_slot: { eventId, day, slot: 'morning' as const },
    };
    await expect(
      scopedPrisma(campusId).eventPresenceClosure.findUnique({ where }),
    ).resolves.toMatchObject({ eventId });
    await expect(
      scopedPrisma(otherCampusId).eventPresenceClosure.findUnique({ where }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
