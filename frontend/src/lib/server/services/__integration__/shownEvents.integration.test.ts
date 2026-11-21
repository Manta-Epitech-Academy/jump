import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';

const { load: loadTalentLayout } =
  await import('../../../../routes/(talent)/+layout.server');
const { load: loadCalendar } =
  await import('../../../../routes/(talent)/calendar/+page.server');
const { load: loadFeedbackPage } =
  await import('../../../../routes/(talent)/feedback/[eventId]/[formId]/+page.server');
const { POST: postFeedback } =
  await import('../../../../routes/api/feedback/[eventId]/[formId]/+server');

/**
 * Anyone but an admin is shown only the events an admin activated (#516). The
 * services the talent's home and parcours read are held to it in their own
 * suites; this one holds the route loads that read events themselves: the
 * talent's planning and what guards it, and the feedback form's page and
 * submission. Each reads an activated event and one nobody activated, enrolled
 * the same way, so the only difference is the activation.
 */
describe('events a talent is shown (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let talentId = '';
  let formSlug = '';
  let shownId = '';
  let hiddenId = '';

  const talent = () => ({ id: talentId, prenom: 'Lou', nom: 'Montrée' });

  async function plannedEvent(publicName: string, activated: boolean) {
    const date = new Date('2026-12-07T08:00:00.000Z');
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
            startTime: new Date('2026-12-07T09:00:00.000Z'),
            endTime: new Date('2026-12-07T10:00:00.000Z'),
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
      await prisma.talent.create({ data: { prenom: 'Lou', nom: 'Montrée' } })
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
    await prisma.talent.deleteMany({ where: { id: talentId } });
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
    await expect(
      postFeedback({
        locals: { talent: talent() },
        params: { eventId: hiddenId, formId: formSlug },
        request: new Request('http://jump.test', {
          method: 'POST',
          body: JSON.stringify({ answers: { avis: 'Top' } }),
        }),
      } as unknown as Parameters<typeof postFeedback>[0]),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await prisma.feedback_Submission.count({
        where: { talentId, eventId: hiddenId },
      }),
    ).toBe(0);
  });
});
