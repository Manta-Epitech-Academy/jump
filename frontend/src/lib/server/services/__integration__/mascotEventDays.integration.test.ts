import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '#lib/server/db.ts';
import { fromWallClock } from '#lib/domain/planningTime.ts';
import { arrivalCues } from '#lib/domain/mascot.ts';
import { loadEventDays } from '#lib/server/services/mascotService.ts';
import { assertTestDatabase } from './testDatabase';

/**
 * The events the duck may announce on arrival (#540, AC3 and AC6), read off a
 * real database at a pinned instant: the enrolments the home calls « inscrit »
 * only, and each event's days on its own campus clock, which is not the
 * talent's when the two are hours apart.
 */
describe('the events the duck announces (integration)', () => {
  const stamp = Date.now();
  /**
   * Tuesday 17 November 2026, 01:30 in La Réunion (UTC+4), still Monday the
   * 16th at 22:30 in Paris.
   */
  const NOW = new Date('2026-11-16T21:30:00Z');
  const REUNION = 'Indian/Reunion';
  const activated = {
    devActivatedAt: NOW,
    modules: { create: { moduleKey: 'inscrits' } },
  };

  let campusId = '';
  let talentId = '';

  async function eventOn(day: string, publicName: string, shown = true) {
    const event = await prisma.event.create({
      data: {
        titre: `${publicName} ${stamp}`,
        publicName,
        campusId,
        date: fromWallClock(day, '09:00', REUNION),
        ...activated,
      },
    });
    // A masked enrolment always carries the status that masks it.
    await prisma.participation.create({
      data: {
        talentId,
        eventId: event.id,
        campusId,
        shownInDevSpace: shown,
        sfMemberStatus: shown ? 'READY' : 'DESISTE',
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `Test Duck ${stamp}`, timezone: REUNION },
      })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Lina', nom: 'Canard' } })
    ).id;
    // Tomorrow on the campus's clock, two days off on Paris's.
    await eventOn('2026-11-18', 'Coding Club');
    // Today, but withdrawn: the home does not count it, nor does he.
    await eventOn('2026-11-17', 'Stage annulé', false);
    // Past the two days he looks ahead.
    await eventOn('2026-11-22', 'Camp');
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('reads each event on its campus clock, among the shown enrolments', async () => {
    const events = await loadEventDays(talentId, NOW);
    expect(events).toEqual([
      {
        name: 'Coding Club',
        date: '2026-11-18',
        endDate: '2026-11-18',
        today: '2026-11-17',
      },
    ]);

    // So he says it is tomorrow, though the talent's Paris clock still reads
    // the day before.
    const cues = arrivalCues({
      visits: { lastDay: '2026-11-15', previousDay: null },
      streakDays: 1,
      today: '2026-11-16',
      events,
    });
    expect(cues[0]).toEqual({
      moment: 'eventTomorrow',
      tokens: { evenement: 'Coding Club' },
    });
  });
});
