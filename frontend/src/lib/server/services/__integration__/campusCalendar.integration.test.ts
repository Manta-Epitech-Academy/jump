/**
 * The campus calendar (#440) is the dev space's landing page, so what it lists
 * is what every dev sees first: the events of their own campus only, only the
 * ones the dev space can open, and beside each the enrolments the dev space
 * shows, never the count Jump holds. Held here on real SQL, where the campus
 * scoping and the relation-filtered count actually run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { loadCampusCalendar } from '../campusCalendar';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();
const TIMEZONE = 'Europe/Paris';
const NOW = new Date('2026-10-26T10:00:00.000Z');

describe('loadCampusCalendar (integration)', () => {
  const campusIds: string[] = [];
  const talentIds: string[] = [];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    assertTestDatabase();
    const [home, other] = await Promise.all(
      ['home', 'other'].map((key) =>
        prisma.campus.create({ data: { name: `Cal ${key} ${stamp}` } }),
      ),
    );
    campusIds.push(home.id, other.id);

    const event = async (
      key: string,
      campusId: string,
      date: string,
      activated = true,
    ) => {
      const row = await prisma.event.create({
        data: {
          titre: `Cal ${key} ${stamp}`,
          campusId,
          date: new Date(date),
          devActivatedAt: activated ? NOW : null,
          modules: { create: { moduleKey: EVENT_MODULES.INSCRITS } },
        },
      });
      ids[key] = row.id;
    };
    await event('camp', home.id, '2026-10-27T00:00:00.000+01:00');
    await event('hidden', home.id, '2026-11-04T00:00:00.000+01:00', false);
    await event('elsewhere', other.id, '2026-10-28T00:00:00.000+01:00');

    for (const shown of [true, true, false]) {
      const talent = await prisma.talent.create({
        data: { prenom: 'Cal', nom: `${stamp}` },
      });
      talentIds.push(talent.id);
      await prisma.participation.create({
        data: {
          talentId: talent.id,
          eventId: ids.camp,
          campusId: home.id,
          // A withdrawal: synced and stored, masked from the dev space.
          sfMemberStatus: shown ? 'MET' : 'DESISTED',
          shownInDevSpace: shown,
        },
      });
    }
  });

  afterAll(async () => {
    try {
      await prisma.participation.deleteMany({
        where: { talentId: { in: talentIds } },
      });
      await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
      await prisma.event.deleteMany({ where: { campusId: { in: campusIds } } });
      await prisma.campus.deleteMany({ where: { id: { in: campusIds } } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('should list its own campus events the dev space can open, with their shown enrolments', async () => {
    // Arrange
    const db = scopedPrisma(campusIds[0]);

    // Act
    const calendar = await loadCampusCalendar(db, {
      timezone: TIMEZONE,
      departement: '69',
      schoolYear: '2026-2027',
      now: NOW,
    });

    // Assert
    expect(Object.keys(calendar.events)).toEqual([ids.camp]);
    expect(calendar.events[ids.camp]).toMatchObject({
      first: '2026-10-27',
      last: '2026-10-27',
      status: 'upcoming',
      daysUntilStart: 1,
      shownEnrolments: 2,
    });
  });
});
