import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '#lib/server/db.ts';
import { callAs } from '#lib/testing/kitRemote.ts';
import { assertTestDatabase } from './testDatabase';

vi.mock('$app/server', () => import('#lib/testing/kitRemote.ts'));

const { load: loadTalentLayout } =
  await import('../../../../routes/(talent)/+layout.server');
const { load: loadCalendar } =
  await import('../../../../routes/(talent)/calendar/+page.server');
const { load: loadFeedbackPage } =
  await import('../../../../routes/(talent)/feedback/[eventId]/[formId]/+page.server');
const { submitFeedback } =
  await import('../../../../routes/(talent)/feedback/[eventId]/[formId]/feedback.remote');
const { load: loadParentHome } =
  await import('../../../../routes/(parent)/parent/+page.server');
const { load: loadParentChild } =
  await import('../../../../routes/(parent)/parent/enfant/[talentId]/+page.server');

/**
 * Anyone but an admin is shown only the events an admin activated (#516). The
 * services the talent's home and parcours read are held to it in their own
 * suites; this one holds the route loads that read events themselves: the
 * talent's planning and what guards it, the feedback form's page and
 * submission (`submitFeedback`), and the parent space. Each reads an activated
 * event and one nobody activated, enrolled the same way, so the only
 * difference is the activation.
 */
describe('events a talent is shown (integration)', () => {
  const stamp = Date.now();
  const HOUR = 60 * 60 * 1000;
  // Two weeks out, so the events are still to come for the parent space,
  // whatever day the suite runs on.
  const eventDay = new Date(Date.now() + 14 * 24 * HOUR);
  const parentEmail = `parent.shown.${stamp}@example.test`;
  let siblingId = '';
  let campusId = '';
  let talentId = '';
  let formSlug = '';
  let shownId = '';
  let hiddenId = '';

  const talent = () => ({ id: talentId, prenom: 'Lou', nom: 'Montrée' });

  async function plannedEvent(publicName: string, activated: boolean) {
    const date = eventDay;
    const event = await prisma.event.create({
      data: {
        titre: `SF-Campaign-${publicName}-${stamp}`,
        publicName,
        campusId,
        date,
        devActivatedAt: activated ? date : null,
        modules: { create: { moduleKey: 'inscrits' } },
        planningSlots: {
          create: {
            nom: `Atelier ${publicName}`,
            activityType: 'atelier',
            startTime: new Date(eventDay.getTime() + HOUR),
            endTime: new Date(eventDay.getTime() + 2 * HOUR),
          },
        },
      },
    });
    await prisma.participation.create({
      data: { talentId, eventId: event.id, campusId },
    });
    return event.id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Shown ${stamp}` } })
    ).id;
    talentId = (
      await prisma.talent.create({
        data: { prenom: 'Lou', nom: 'Montrée', parentEmail },
      })
    ).id;
    // A second child, so the parent's home lists them rather than redirecting
    // to the only one.
    siblingId = (
      await prisma.talent.create({
        data: { prenom: 'Noé', nom: 'Montrée', parentEmail },
      })
    ).id;
    formSlug = (
      await prisma.feedback_Form.create({
        data: {
          slug: `shown-avis-${stamp}`,
          title: `Avis ${stamp}`,
          status: 'published',
          allowsAuthenticatedAccess: true,
          questions: {
            create: {
              key: 'avis',
              position: 0,
              prompt: 'Ton avis ?',
              type: 'single',
              options: { create: [{ position: 0, label: 'Top' }] },
            },
          },
        },
      })
    ).slug;
    shownId = await plannedEvent('Stage prêt', true);
    hiddenId = await plannedEvent('Stage pas prêt', false);
  });

  afterAll(async () => {
    await prisma.feedback_Submission.deleteMany({ where: { talentId } });
    await prisma.event.deleteMany({ where: { campusId } });
    await prisma.feedback_Form.deleteMany({ where: { slug: formSlug } });
    await prisma.talent.deleteMany({
      where: { id: { in: [talentId, siblingId] } },
    });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('lays out only the activated event on the planning, under its public name', async () => {
    const data = (await loadCalendar({
      locals: { talent: talent() },
      parent: async () => ({ hasPlannedEvents: true }),
    } as unknown as Parameters<typeof loadCalendar>[0])) as {
      planning: { slots: { event: { id: string; name: string } }[] };
    };
    expect(data.planning.slots.map((slot) => slot.event)).toEqual([
      { id: shownId, name: 'Stage prêt' },
    ]);
  });

  it('offers no planning when the only planned event is not activated', async () => {
    const layout = (locals: object) =>
      loadTalentLayout({ locals } as unknown as Parameters<
        typeof loadTalentLayout
      >[0]) as Promise<{ hasPlannedEvents: boolean }>;
    expect((await layout({ talent: talent() })).hasPlannedEvents).toBe(true);

    await prisma.event.update({
      where: { id: shownId },
      data: { devActivatedAt: null },
    });
    try {
      expect((await layout({ talent: talent() })).hasPlannedEvents).toBe(false);
    } finally {
      await prisma.event.update({
        where: { id: shownId },
        data: { devActivatedAt: new Date() },
      });
    }
  });

  it('opens the feedback form of an activated event only', async () => {
    const page = (eventId: string) =>
      loadFeedbackPage({
        locals: { talent: talent() },
        params: { eventId, formId: formSlug },
      } as unknown as Parameters<typeof loadFeedbackPage>[0]);
    await expect(page(shownId)).resolves.toMatchObject({ eventId: shownId });
    await expect(page(hiddenId)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an answer on an event no admin activated', async () => {
    // A talent the app is open to, so the command's gate admits them and what
    // refuses is the enrolment rule (`feedbackParticipationWhere`).
    callAs({
      talent: {
        ...talent(),
        niveau: '4eme',
        welcomeSeenAt: new Date(),
        charterAcceptedAt: new Date(),
      } as unknown as App.Locals['talent'],
    });
    await expect(
      submitFeedback({
        eventId: hiddenId,
        formId: formSlug,
        answers: { avis: 'Top' },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await prisma.feedback_Submission.count({
        where: { talentId, eventId: hiddenId },
      }),
    ).toBe(0);
  });

  const parent = { role: 'parent', email: parentEmail, name: 'Montrée' };

  it('neither counts nor names an event no admin activated on the parent home', async () => {
    const data = (await loadParentHome({
      locals: { user: parent },
    } as unknown as Parameters<typeof loadParentHome>[0])) as {
      children: {
        id: string;
        eventsCount: number;
        upcomingEvent: { name: string } | null;
      }[];
    };
    expect(data.children.find((c) => c.id === talentId)).toMatchObject({
      eventsCount: 1,
      upcomingEvent: { name: 'Stage prêt' },
    });
  });

  it('lists only the activated event among a child’s upcoming ones, under its public name', async () => {
    const data = (await loadParentChild({
      locals: { user: parent },
      params: { talentId },
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof loadParentChild>[0])) as {
      upcomingEvents: { id: string; name: string }[];
    };
    expect(data.upcomingEvents.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: shownId, name: 'Stage prêt' },
    ]);
  });
});
