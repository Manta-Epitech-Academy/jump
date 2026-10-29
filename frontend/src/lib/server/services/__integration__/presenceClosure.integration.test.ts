import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { dateKeyToDbDate, toDateKey } from '$lib/domain/eventPresence';
import { closePresenceSlot } from '$lib/server/services/presenceService';
import { assertTestDatabase } from './testDatabase';

/**
 * Closing a créneau writes no absent row: whoever the sheet lists without a mark
 * simply reads absent from then on. The number the person who closed it reads
 * back is therefore counted, not stored, and it has to count the sheet they
 * were looking at: a masked enrolment is not on it, and a marked talent is not
 * absent.
 */
describe('closing an émargement créneau (integration)', () => {
  const stamp = Date.now();
  const tz = 'Europe/Paris';
  let campusId = '';
  let eventId = '';
  const talentIds: string[] = [];

  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() + 21 + ((8 - monday.getUTCDay()) % 7));
  monday.setUTCHours(7, 0, 0, 0);
  const day = dateKeyToDbDate(toDateKey(monday, tz));

  async function enrol(shown: boolean) {
    const talent = await prisma.talent.create({
      data: { prenom: 'Lou', nom: shown ? 'Inscrite' : 'Masquée' },
      select: { id: true },
    });
    talentIds.push(talent.id);
    await prisma.participation.create({
      data: {
        talentId: talent.id,
        eventId,
        campusId,
        sfMemberStatus: shown ? 'READY' : 'DESISTED',
        shownInDevSpace: shown,
      },
    });
    return talent.id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `Closure Campus ${stamp}`, timezone: tz },
      })
    ).id;
    eventId = (
      await prisma.event.create({
        data: { titre: `Closure ${stamp}`, campusId, date: monday },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('counts the listed talents left without a mark, and only them', async () => {
    const present = await enrol(true);
    await enrol(true);
    await enrol(true);
    await enrol(false);
    await prisma.eventPresence.create({
      data: {
        talentId: present,
        eventId,
        day,
        slot: 'morning',
        status: 'present',
        source: 'manual',
      },
    });

    const { absent } = await closePresenceSlot(
      campusId,
      eventId,
      day,
      'morning',
      null,
    );

    expect(absent).toBe(2);
    expect(
      await prisma.eventPresenceClosure.count({
        where: { eventId, day, slot: 'morning' },
      }),
    ).toBe(1);
  });
});
