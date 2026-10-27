import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { countPriorEnrolments } from '../enrolmentHistory';
import { assertTestDatabase } from './testDatabase';

/**
 * The count behind a talent's parcours (« 3ᵉ inscription »). It has to stay on
 * the campus (the scoped client does not scope this groupBy, so the campus is
 * written by hand and a leak would be silent), skip the enrolments the dev
 * space masks, and count only events strictly before the one being read: the
 * event itself and a later one are not history.
 */
describe('prior enrolments (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let otherCampusId = '';
  let talentId = '';
  let newcomerId = '';
  const eventIds: string[] = [];

  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Parcours ${stamp}` } })
    ).id;
    otherCampusId = (
      await prisma.campus.create({ data: { name: `Parcours autre ${stamp}` } })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Lou', nom: 'Fidèle' } })
    ).id;
    newcomerId = (
      await prisma.talent.create({ data: { prenom: 'Noé', nom: 'Nouveau' } })
    ).id;

    const enrol = async (
      campus: string,
      date: string,
      talent: string,
      shown = true,
    ) => {
      const event = await prisma.event.create({
        data: { titre: `Parcours ${date}`, campusId: campus, date: day(date) },
      });
      eventIds.push(event.id);
      await prisma.participation.create({
        data: {
          talentId: talent,
          eventId: event.id,
          campusId: campus,
          sfMemberStatus: shown ? 'READY' : 'DESISTED',
          shownInDevSpace: shown,
        },
      });
    };

    await enrol(campusId, '2026-01-10', talentId); // counts
    await enrol(campusId, '2026-03-10', talentId); // counts
    await enrol(campusId, '2026-04-10', talentId, false); // masked
    await enrol(otherCampusId, '2026-05-10', talentId); // other campus
    await enrol(campusId, '2026-06-10', talentId); // the event read
    await enrol(campusId, '2026-06-10', newcomerId); // same day, not history
    await enrol(campusId, '2026-09-10', talentId); // later
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.talent.deleteMany({
      where: { id: { in: [talentId, newcomerId] } },
    });
    await prisma.campus.deleteMany({
      where: { id: { in: [campusId, otherCampusId] } },
    });
  });

  it('counts the shown enrolments on the campus at earlier events only', async () => {
    const counts = await countPriorEnrolments(
      campusId,
      [talentId, newcomerId],
      day('2026-06-10'),
    );
    expect(counts.get(talentId)).toBe(2);
    expect(counts.has(newcomerId)).toBe(false);
  });

  it('reads an earlier event as it stood then', async () => {
    const counts = await countPriorEnrolments(
      campusId,
      [talentId],
      day('2026-03-10'),
    );
    expect(counts.get(talentId)).toBe(1);
  });
});
