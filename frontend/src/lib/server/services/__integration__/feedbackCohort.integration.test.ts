import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  buildSubmissionWhere,
  computeFormStats,
} from '$lib/server/feedbackStats';
import { resolveScope } from '$lib/server/adminApi/scope';
import { getFeedbackResults } from '$lib/server/services/adminStats/feedbackResults';
import { assertTestDatabase } from './testDatabase';

/**
 * Whose answers a bilan counts, on the dev page and in the admin response rate.
 *
 * A talent whose enrolment the dev space masks (withdrawn in Salesforce, say)
 * may have answered before the status moved. The dev Bilan lists the cohort it
 * shows, so its figures and its export are that cohort's answers; the admin
 * response rate is a share of the visible enrolments that answered, so the
 * masked answer is a response without being one of the invited. Counted on its
 * own, it pushed the rate toward and past 100 %.
 */
describe('the cohort a bilan counts (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  let formId = '';
  const talentIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Bilan Campus ${stamp}` } })
    ).id;
    const form = await prisma.feedback_Form.create({
      data: {
        slug: `bilan-cohort-${stamp}`,
        title: `Bilan cohorte ${stamp}`,
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
      include: { questions: { include: { options: true } } },
    });
    formId = form.id;
    const [question] = form.questions;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Bilan Event',
          campusId,
          date: new Date('2026-09-01T09:00:00.000Z'),
          feedbackFormId: formId,
          modules: { create: { moduleKey: EVENT_MODULES.BILAN } },
        },
      })
    ).id;

    // Shown and answered, shown and silent, masked and answered.
    const cohort = [
      { nom: 'Répond', shown: true, answers: true },
      { nom: 'Silence', shown: true, answers: false },
      { nom: 'Masquée', shown: false, answers: true },
    ];
    for (const member of cohort) {
      const talent = await prisma.talent.create({
        data: { prenom: 'Lou', nom: member.nom },
      });
      talentIds.push(talent.id);
      await prisma.participation.create({
        data: {
          talentId: talent.id,
          eventId,
          campusId,
          sfMemberStatus: member.shown ? 'READY' : 'DESISTED',
          shownInDevSpace: member.shown,
        },
      });
      if (!member.answers) continue;
      await prisma.feedback_Submission.create({
        data: {
          formId,
          eventId,
          talentId: talent.id,
          source: 'authenticated',
          answers: {
            create: {
              questionId: question.id,
              selectedOptions: { create: { optionId: question.options[0].id } },
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.feedback_Submission.deleteMany({ where: { formId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.feedback_Form.deleteMany({ where: { id: formId } });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('counts and exports the answers of the cohort the dev space shows', async () => {
    const stats = await computeFormStats(formId, { shownCohortOf: eventId });
    expect(stats?.totalSubmissions).toBe(1);
    expect(stats?.questions[0].answeredCount).toBe(1);

    const exported = await prisma.feedback_Submission.findMany({
      where: buildSubmissionWhere(formId, { shownCohortOf: eventId }),
      select: { talentId: true },
    });
    expect(exported).toEqual([{ talentId: talentIds[0] }]);
  });

  it('keeps every answer for the admin, who sees every enrolment', async () => {
    const stats = await computeFormStats(formId, { eventId });
    expect(stats?.totalSubmissions).toBe(2);
  });

  it('rates the invited who answered, not every connected answer', async () => {
    const results = await getFeedbackResults(await resolveScope({ eventId }));
    expect(results.forms.value).toEqual([
      expect.objectContaining({
        formId,
        connectedSubmissions: 2,
        invited: 2,
        responseRate: 50,
      }),
    ]);
  });
});
