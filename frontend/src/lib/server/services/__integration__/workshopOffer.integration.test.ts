import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { fromWallClock } from '$lib/domain/planningTime';
import {
  listTalentWorkshops,
  resolveWorkshopEntry,
} from '$lib/server/services/workshopService';
import { assertTestDatabase } from './testDatabase';

/**
 * Which activities a talent is offered, read through BOTH doors at a pinned
 * instant: the dashboard that shows them, and the entry that lets a talent in.
 *
 * They share one rule on purpose, and this is where that is held: an activity
 * the page hides but the entry still opens is one hand-made POST away from a
 * camp's subject being started a week early.
 */
describe('which activities a talent is offered (integration)', () => {
  const stamp = Date.now();
  /** Wednesday 28 October 2026, 11:00 in Paris. */
  const NOW = new Date('2026-10-28T10:00:00Z');
  const sfDay = (key: string) => new Date(`${key}T00:00:00Z`);

  let talentId = '';
  const campusIds: string[] = [];
  const instanceIds = new Map<string, string>();

  const slug = (name: string) => `offer-${name}-${stamp}`;

  async function campus(timezone: string) {
    const row = await prisma.campus.create({
      data: { name: `Test Offer ${timezone} ${stamp}`, timezone },
    });
    campusIds.push(row.id);
    return row.id;
  }

  async function event(
    campusId: string,
    titre: string,
    date: Date,
    offers: string[],
    endDate: Date | null = null,
  ) {
    const row = await prisma.event.create({
      data: { titre: `${titre} ${stamp}`, campusId, date, endDate },
    });
    for (const [position, name] of offers.entries()) {
      await prisma.eventConfig_Workshop.create({
        data: {
          eventId: row.id,
          instanceId: instanceIds.get(name)!,
          position,
          durationMinutes: 120,
        },
      });
    }
    await prisma.participation.create({
      data: { talentId, eventId: row.id, campusId },
    });
    return row.id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    for (const name of [
      'tomorrow',
      'today',
      'stage',
      'past',
      'started',
      'reunion',
    ]) {
      const row = await prisma.workshop_Instance.create({
        data: {
          slug: slug(name),
          label: `Atelier ${name}`,
          baseUrl: 'https://offer.ctfd.invalid',
        },
      });
      instanceIds.set(name, row.id);
    }
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Lou', nom: 'Offre' } })
    ).id;

    const paris = await campus('Europe/Paris');
    const reunion = await campus('Indian/Reunion');

    await event(paris, 'Demain', sfDay('2026-10-29'), ['tomorrow']);
    await event(paris, 'Aujourd’hui', sfDay('2026-10-28'), ['today']);
    // Started yesterday, ends Friday: every day of it is « today ».
    await event(
      paris,
      'Stage',
      sfDay('2026-10-27'),
      ['stage'],
      fromWallClock('2026-10-30', '23:59', 'Europe/Paris'),
    );
    // The same subject as today's, a month ago: today's must win.
    await event(paris, 'Il y a un mois', sfDay('2026-09-30'), [
      'past',
      'today',
    ]);
    // Only a future event offers it, but the talent has already walked it.
    const future = await event(paris, 'Décembre', sfDay('2026-12-02'), [
      'started',
    ]);
    await prisma.workshop_Participation.create({
      data: {
        talentId,
        instanceId: instanceIds.get('started')!,
        eventId: future,
        campusId: paris,
        budgetMinutes: 120,
      },
    });
    await event(reunion, 'Saint-Denis', sfDay('2026-10-28'), ['reunion']);
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.event.deleteMany({ where: { campusId: { in: campusIds } } });
      await prisma.workshop_Instance.deleteMany({
        where: { id: { in: [...instanceIds.values()] } },
      });
      await prisma.campus.deleteMany({ where: { id: { in: campusIds } } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('shows nothing of an event that starts tomorrow, and refuses its entry', async () => {
    const { today, activities } = await listTalentWorkshops(talentId, NOW);
    const shown = [...(today?.activities ?? []), ...activities].map(
      (a) => a.slug,
    );
    expect(shown).not.toContain(slug('tomorrow'));
    expect(await resolveWorkshopEntry(talentId, slug('tomorrow'), NOW)).toBe(
      null,
    );
  });

  it('puts every event running today in the hero, multi-day ones included', async () => {
    const { today } = await listTalentWorkshops(talentId, NOW);
    expect(today?.activities.map((a) => a.slug).sort()).toEqual(
      [slug('reunion'), slug('stage'), slug('today')].sort(),
    );
  });

  it('resolves a subject offered today and a month ago to today’s event', async () => {
    const { today, activities } = await listTalentWorkshops(talentId, NOW);
    expect(activities.map((a) => a.slug)).not.toContain(slug('today'));
    const entry = await resolveWorkshopEntry(talentId, slug('today'), NOW);
    const todaysEvent = await prisma.event.findFirstOrThrow({
      where: { titre: `Aujourd’hui ${stamp}` },
      select: { id: true },
    });
    expect(entry?.eventId).toBe(todaysEvent.id);
    expect(today?.eventName).toContain('Aujourd’hui');
  });

  it('keeps past events below the hero, newest first, and what was started', async () => {
    const { activities } = await listTalentWorkshops(talentId, NOW);
    expect(activities.map((a) => a.slug)).toEqual([
      slug('started'),
      slug('past'),
    ]);
    expect(await resolveWorkshopEntry(talentId, slug('started'), NOW)).not.toBe(
      null,
    );
  });

  it('reads « today » on each event’s own campus clock', async () => {
    // 22:00 in Paris, already 01:00 tomorrow in Saint-Denis.
    const late = new Date('2026-10-28T21:00:00Z');
    const { today, activities } = await listTalentWorkshops(talentId, late);
    expect(today?.activities.map((a) => a.slug)).toContain(slug('today'));
    expect(today?.activities.map((a) => a.slug)).not.toContain(slug('reunion'));
    expect(activities.map((a) => a.slug)).toContain(slug('reunion'));
  });
});
