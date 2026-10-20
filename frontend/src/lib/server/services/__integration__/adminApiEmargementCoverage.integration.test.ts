import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { dateKeyToDbDate, toDateKey } from '$lib/domain/eventPresence';
import { resolveScope } from '$lib/server/adminApi/scope';
import { getEmargementCoverage } from '$lib/server/services/adminStats/emargementCoverage';
import { assertTestDatabase } from './testDatabase';

/**
 * Whether the register is being kept, as `ops_emargement_coverage` answers it.
 *
 * A créneau counts once it has elapsed (past its 11h/15h cutoff, or closed
 * early by a staff member), and is kept when it holds at least one mark, by the
 * team or by the talent's own code. It used to count closure rows, which only an
 * early close writes, so the figure read close to 0 % for every campus.
 */
describe('émargement coverage (integration)', () => {
  const stamp = Date.now();
  const tz = 'Europe/Paris';
  const campusName = `Coverage Campus ${stamp}`;
  let campusId = '';
  let talentId = '';
  let pastId = '';
  let futureId = '';

  // Past: Monday and Tuesday, four créneaux, all elapsed by the clock.
  const monday = dateKeyToDbDate('2026-03-02');
  const tuesday = dateKeyToDbDate('2026-03-03');
  const wednesday = dateKeyToDbDate('2026-03-04');
  // Future: one day two months out, so only an early close can elapse it.
  const futureInstant = new Date(Date.now() + 60 * 86_400_000);
  const futureDay = dateKeyToDbDate(toDateKey(futureInstant, tz));

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: campusName, timezone: tz } })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Noa', nom: 'Pointée' } })
    ).id;
    const withRegister = {
      campusId,
      modules: { create: { moduleKey: EVENT_MODULES.EMARGEMENT } },
    };
    pastId = (
      await prisma.event.create({
        data: {
          ...withRegister,
          titre: 'Coverage Past',
          date: new Date('2026-03-02T08:00:00Z'),
          endDate: new Date('2026-03-03T21:00:00Z'),
        },
      })
    ).id;
    futureId = (
      await prisma.event.create({
        data: {
          ...withRegister,
          titre: 'Coverage Future',
          date: futureInstant,
        },
      })
    ).id;

    await prisma.eventPresence.createMany({
      data: [
        // Kept by the team.
        {
          talentId,
          eventId: pastId,
          day: monday,
          slot: 'morning',
          status: 'present',
          source: 'manual',
        },
        // Kept by the talent's own code.
        {
          talentId,
          eventId: pastId,
          day: tuesday,
          slot: 'afternoon',
          status: 'present',
          source: 'qr',
        },
        // Outside the event's window: counts as a mark, keeps no créneau.
        {
          talentId,
          eventId: pastId,
          day: wednesday,
          slot: 'morning',
          status: 'present',
          source: 'manual',
        },
        // Closed early and marked: elapsed and kept.
        {
          talentId,
          eventId: futureId,
          day: futureDay,
          slot: 'morning',
          status: 'present',
          source: 'manual',
        },
        // Marked but still to come: neither elapsed nor kept.
        {
          talentId,
          eventId: futureId,
          day: futureDay,
          slot: 'afternoon',
          status: 'present',
          source: 'qr',
        },
      ],
    });
    await prisma.eventPresenceClosure.createMany({
      data: [
        // Closed early by hand on a past créneau nobody marked: elapsed, not kept.
        { eventId: pastId, day: monday, slot: 'afternoon' },
        { eventId: futureId, day: futureDay, slot: 'morning' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.event.deleteMany({
      where: { id: { in: [pastId, futureId] } },
    });
    await prisma.talent.deleteMany({ where: { id: talentId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  const coverage = async () =>
    getEmargementCoverage(await resolveScope({ campus: campusName }));

  it('counts a créneau as kept once it has elapsed and holds a mark of any source', async () => {
    const answer = await coverage();
    expect(answer.slots.value).toBe(6);
    expect(answer.elapsedSlots.value).toBe(5);
    expect(answer.keptSlots.value).toBe(3);
    expect(answer.keptShare.value).toBe(60);
    expect(answer.marks.value).toBe(5);
  });

  it('reads each event on its own grid', async () => {
    const { perEvent } = await coverage();
    expect(perEvent.value).toEqual([
      expect.objectContaining({
        eventId: futureId,
        slots: 2,
        elapsedSlots: 1,
        keptSlots: 1,
        keptShare: 100,
      }),
      expect.objectContaining({
        eventId: pastId,
        slots: 4,
        elapsedSlots: 4,
        keptSlots: 2,
        keptShare: 50,
      }),
    ]);
  });
});
