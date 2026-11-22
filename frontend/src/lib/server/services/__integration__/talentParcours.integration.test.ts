import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { fromWallClock } from '$lib/domain/planningTime';
import { workshopGrantSourceId } from '$lib/domain/workshops';
import { loadTalentParcours } from '$lib/server/talent/parcours';
import { assertTestDatabase } from './testDatabase';

/**
 * « Mon parcours » read off a real database (#445): « venu » is the dev space's
 * rule, « inscrit » the home hero's, and an event no admin activated is shown
 * to nobody else.
 */
describe('loadTalentParcours', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  /** Wednesday 18 November 2026, 10:00 in Paris. */
  const NOW = new Date('2026-11-18T09:00:00Z');
  const parisDay = (key: string) => fromWallClock(key, '00:00', 'Europe/Paris');

  let campusId = '';
  let talentId = '';
  let instanceId = '';
  let activityId = '';
  const categoryKey = `parcours-stage-${stamp}`;
  const slug = `parcours-pong-${stamp}`;
  const ids: Record<string, string> = {};

  async function event(
    name: string,
    day: string,
    { activated = true }: { activated?: boolean } = {},
  ) {
    ids[name] = (
      await prisma.event.create({
        data: {
          titre: `Parcours-${name}-${stamp}`,
          publicName: `Parcours ${name}`,
          campusId,
          date: parisDay(day),
          categoryKey: name === 'stage' ? categoryKey : null,
          devActivatedAt: activated ? NOW : null,
          modules: { create: { moduleKey: 'inscrits' } },
        },
      })
    ).id;
  }

  async function enrol(
    name: string,
    { attended = false, shown = true }: { attended?: boolean; shown?: boolean },
  ) {
    await prisma.participation.create({
      data: {
        talentId,
        eventId: ids[name],
        campusId,
        shownInDevSpace: shown,
        sfMemberStatus: shown ? 'MET' : 'DESISTE',
        attendanceAttested: attended,
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `Test Parcours ${stamp}`, timezone: 'Europe/Paris' },
      })
    ).id;
    await prisma.eventConfig_Category.create({
      data: {
        key: categoryKey,
        label: `Stage ${stamp}`,
        color: '#ff1ef7',
        keyEvent: true,
      },
    });
    instanceId = (
      await prisma.workshop_Instance.create({
        data: {
          slug: `parcours-host-${stamp}`,
          baseUrl: 'https://parcours.ctfd.invalid',
        },
      })
    ).id;
    activityId = (
      await prisma.workshop_Activity.create({
        data: { slug, instanceId, label: 'PyPong' },
      })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Léa', nom: 'Parcours' } })
    ).id;

    // Came to the stage on a Salesforce status alone: the dev space's « venu ».
    await event('stage', '2026-06-15');
    await enrol('stage', { attended: true });
    // Came to an event no admin ever activated, and walked an activity there:
    // neither the visit nor the grant may bring the event into the parcours.
    await event('hidden', '2026-09-12', { activated: false });
    await enrol('hidden', { attended: true });
    await prisma.xpGrant.create({
      data: {
        talentId,
        campusId,
        source: 'workshop',
        sourceId: workshopGrantSourceId(`${slug}-hidden`, talentId),
        amount: 40,
        eventId: ids.hidden,
      },
    });
    // No proof of a visit, but an activity walked there.
    await event('club', '2026-10-07');
    await enrol('club', {});
    await prisma.xpGrant.create({
      data: {
        talentId,
        campusId,
        source: 'workshop',
        sourceId: workshopGrantSourceId(slug, talentId),
        amount: 60,
        eventId: ids.club,
      },
    });
    // Enrolled next month, and withdrawn from the week after.
    await event('camp', '2026-12-12');
    await enrol('camp', {});
    await event('withdrawn', '2026-12-19');
    await enrol('withdrawn', { shown: false });
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.eventConfig_Category.deleteMany({
        where: { key: categoryKey },
      });
      await prisma.workshop_Activity.deleteMany({ where: { id: activityId } });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('tells the visits the dev space counts, and the events of an activity, never a non-activated one', async () => {
    const past = (await loadTalentParcours(talentId, NOW))
      .flatMap((stretch) => stretch.events)
      .filter((e) => e.phase === 'past');
    expect(past.map((e) => e.id)).toEqual([ids.club, ids.stage]);
    expect(past[0].activities).toEqual([
      { slug, label: 'PyPong', xp: 60, next: null },
    ]);
    expect(past[1]).toMatchObject({
      name: 'Parcours stage',
      days: '15 juin',
      color: '#ff1ef7',
      keyEvent: true,
    });
  });

  it('marks as to come the event the talent is enrolled in, not the one they withdrew from', async () => {
    const ahead = (await loadTalentParcours(talentId, NOW))
      .flatMap((stretch) => stretch.events)
      .filter((e) => e.phase !== 'past');
    expect(ahead.map((e) => [e.id, e.phase])).toEqual([[ids.camp, 'upcoming']]);
  });
});
