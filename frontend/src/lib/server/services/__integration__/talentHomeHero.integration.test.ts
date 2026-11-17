import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { fromWallClock } from '$lib/domain/planningTime';
import {
  UNNAMED_EVENT_CALENDAR_NAME,
  enrolledEventCalendar,
  listEnrolledHeroEvents,
  loadHomeHero,
} from '$lib/server/services/talentHomeHero';
import { assertTestDatabase } from './testDatabase';

/**
 * The home's hero read off a real database at a pinned instant: who counts as
 * enrolled is the dev space's own rule (#491), and the hero follows the
 * enrolment the moment Salesforce sends it, with nobody touching the campus's
 * highlight.
 */
describe('the talent home hero (integration)', () => {
  const stamp = Date.now();
  /** Monday 16 November 2026, 11:00 in Paris. */
  const NOW = new Date('2026-11-16T10:00:00Z');
  const parisDay = (key: string) => fromWallClock(key, '00:00', 'Europe/Paris');
  const parisLastDay = (key: string) =>
    fromWallClock(key, '23:59', 'Europe/Paris');

  let campusId = '';
  let instanceId = '';
  let activityId = '';
  let campId = '';
  let stageId = '';
  let jpoId = '';
  let enrolledTalent = '';
  let otherTalent = '';

  async function enrol(
    talentId: string,
    eventId: string,
    shownInDevSpace = true,
  ) {
    // A masked enrolment always carries the status that masks it.
    await prisma.participation.create({
      data: {
        talentId,
        eventId,
        campusId,
        shownInDevSpace,
        sfMemberStatus: shownInDevSpace ? 'READY' : 'DESISTE',
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `Test Hero ${stamp}`, timezone: 'Europe/Paris' },
      })
    ).id;
    instanceId = (
      await prisma.workshop_Instance.create({
        data: {
          slug: `hero-host-${stamp}`,
          baseUrl: 'https://hero.ctfd.invalid',
        },
      })
    ).id;
    activityId = (
      await prisma.workshop_Activity.create({
        data: { slug: `hero-pacman-${stamp}`, instanceId, label: 'Pacman' },
      })
    ).id;

    // A stage running this week, offering a subject all of it.
    stageId = (
      await prisma.event.create({
        data: {
          titre: `Stage ${stamp}`,
          campusId,
          date: parisDay('2026-11-16'),
          endDate: parisLastDay('2026-11-20'),
          startMinutes: 9 * 60,
        },
      })
    ).id;
    await prisma.eventConfig_Workshop.create({
      data: { eventId: stageId, activityId, position: 0 },
    });
    // The camp the campus puts forward, in eleven days.
    campId = (
      await prisma.event.create({
        data: {
          titre: `Camp ${stamp}`,
          publicName: 'Halloween Camp',
          campusId,
          date: parisDay('2026-11-27'),
          endDate: parisLastDay('2026-11-28'),
          startMinutes: 10 * 60,
          signupUrl: 'https://www.epitech.invalid/inscription',
        },
      })
    ).id;
    // An open day that took place on Saturday.
    jpoId = (
      await prisma.event.create({
        data: {
          titre: `JPO ${stamp}`,
          campusId,
          date: parisDay('2026-11-14'),
        },
      })
    ).id;
    await prisma.talentHome_Highlight.create({
      data: { campusId, eventId: campId },
    });

    enrolledTalent = (
      await prisma.talent.create({ data: { prenom: 'Lina', nom: 'Hero' } })
    ).id;
    otherTalent = (
      await prisma.talent.create({ data: { prenom: 'Sam', nom: 'Hero' } })
    ).id;
    // Withdrawn from the stage (a status the event masks), enrolled in the camp.
    await enrol(enrolledTalent, stageId, false);
    await enrol(enrolledTalent, campId);
    // Came to the open day, enrolled in nothing to come.
    await enrol(otherTalent, jpoId);
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({
        where: { id: { in: [enrolledTalent, otherTalent] } },
      });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.workshop_Activity.deleteMany({ where: { id: activityId } });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('does not count a masked enrolment, nor offer its subjects now', async () => {
    const enrolled = await listEnrolledHeroEvents(enrolledTalent, NOW);
    expect(enrolled.map((event) => event.id)).toEqual([campId]);

    const { hero, workshops } = await loadHomeHero(
      enrolledTalent,
      campusId,
      NOW,
    );
    expect(workshops.today).toEqual([]);
    expect(hero?.kind).not.toBe('live');
  });

  it('tells a talent enrolled in the campus’s event they are expected, not to sign up', async () => {
    const { hero } = await loadHomeHero(enrolledTalent, campusId, NOW);
    expect(hero).toMatchObject({
      kind: 'enrolled',
      event: {
        id: campId,
        name: 'Halloween Camp',
        date: '2026-11-27',
        endDate: '2026-11-28',
        startMinutes: 600,
      },
      countdownDays: 11,
    });
  });

  it('leaves an ended event behind and invites to the campus’s event', async () => {
    expect(await listEnrolledHeroEvents(otherTalent, NOW)).toEqual([]);
    const { hero } = await loadHomeHero(otherTalent, campusId, NOW);
    expect(hero).toMatchObject({
      kind: 'invitation',
      event: {
        id: campId,
        signupUrl: 'https://www.epitech.invalid/inscription',
      },
    });
  });

  // AC4: « Ajouter à mon agenda » serves the talent's own event, and only one
  // they are expected at: a masked enrolment downloads nothing.
  it('builds the calendar entry of an event the talent is expected at only', async () => {
    expect(await enrolledEventCalendar(enrolledTalent, campId)).toEqual({
      id: campId,
      name: 'Halloween Camp',
      date: '2026-11-27',
      endDate: '2026-11-28',
      location: `Epitech Test Hero ${stamp}`,
      description: 'Accueil à 10h00',
    });
    expect(await enrolledEventCalendar(enrolledTalent, stageId)).toBeNull();
  });

  // A campaign title is an internal label (8de24153): an event with no public
  // name is not named on the home, nor in the talent's calendar.
  it('never names an event by its Salesforce title', async () => {
    const talentId = (
      await prisma.talent.create({ data: { prenom: 'Noa', nom: 'Hero' } })
    ).id;
    const unnamedId = (
      await prisma.event.create({
        data: {
          titre: `Paris-2026-11-20-CodingClub-${stamp}`,
          campusId,
          date: parisDay('2026-11-20'),
        },
      })
    ).id;
    try {
      await enrol(talentId, unnamedId);
      const { hero } = await loadHomeHero(talentId, campusId, NOW);
      expect(hero).toMatchObject({
        kind: 'enrolled',
        event: { id: unnamedId, name: null },
      });
      expect(await enrolledEventCalendar(talentId, unnamedId)).toMatchObject({
        name: UNNAMED_EVENT_CALENDAR_NAME,
      });
    } finally {
      await prisma.talent.deleteMany({ where: { id: talentId } });
    }
  });

  it('switches to « enrolled » once Salesforce sends the enrolment', async () => {
    await enrol(otherTalent, campId);
    const { hero } = await loadHomeHero(otherTalent, campusId, NOW);
    expect(hero).toMatchObject({ kind: 'enrolled', event: { id: campId } });
  });
});
