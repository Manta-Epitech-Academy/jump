import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { RECO_QUESTION_KEY } from '$lib/domain/feedback';
import {
  loadCohortSubmissions,
  recoQuestionOf,
} from '$lib/server/feedbackStats';
import { getFormGraphById } from '$lib/server/feedbackForms';
import { assertTestDatabase } from './testDatabase';

/**
 * Each talent's answer to an event's recommendation question, the one read the
 * Bilan roster and the Inscrits filter share. What it must get right: the
 * answer is an option id (a renamed label still matches), a silent talent has
 * no entry, a masked enrolment's answer is not the cohort's, and a form that
 * asks no recommendation answers for none.
 */
describe('recommendation answers per talent (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let eventId = '';
  let recoFormId = '';
  let plainFormId = '';
  const talentIds: string[] = [];
  let yesOptionId = '';

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Reco Campus ${stamp}` } })
    ).id;
    const recoForm = await prisma.feedback_Form.create({
      data: {
        slug: `reco-answers-${stamp}`,
        title: `Reco ${stamp}`,
        status: 'published',
        allowsAuthenticatedAccess: true,
        questions: {
          create: {
            key: RECO_QUESTION_KEY,
            position: 0,
            prompt: 'Tu recommandes ?',
            type: 'single',
            options: {
              create: [
                { position: 0, label: 'Oui' },
                { position: 1, label: 'Non' },
                { position: 2, label: 'Autre', kind: 'extra' },
              ],
            },
          },
        },
      },
      include: { questions: { include: { options: true } } },
    });
    recoFormId = recoForm.id;
    const [question] = recoForm.questions;
    yesOptionId = question.options.find((o) => o.label === 'Oui')!.id;
    plainFormId = (
      await prisma.feedback_Form.create({
        data: {
          slug: `reco-none-${stamp}`,
          title: `Sans reco ${stamp}`,
          status: 'published',
          allowsAuthenticatedAccess: true,
        },
      })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Reco Event',
          campusId,
          date: new Date('2026-09-01T09:00:00.000Z'),
          feedbackFormId: recoFormId,
        },
      })
    ).id;

    const cohort = [
      { nom: 'Oui', shown: true, answers: true },
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
          formId: recoFormId,
          eventId,
          talentId: talent.id,
          source: 'authenticated',
          answers: {
            create: {
              questionId: question.id,
              selectedOptions: { create: { optionId: yesOptionId } },
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.feedback_Submission.deleteMany({
      where: { formId: recoFormId },
    });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.feedback_Form.deleteMany({
      where: { id: { in: [recoFormId, plainFormId] } },
    });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it("offers the form's verdicts in its own order, without the extra box", async () => {
    const reco = recoQuestionOf((await getFormGraphById(recoFormId))!);
    expect(reco?.options.map((o) => o.label)).toEqual(['Oui', 'Non']);
  });

  it('finds no recommendation on a form that asks none', async () => {
    expect(recoQuestionOf((await getFormGraphById(plainFormId))!)).toBeNull();
  });

  it("keys the shown cohort's answers by talent, as option ids", async () => {
    const reco = recoQuestionOf((await getFormGraphById(recoFormId))!);
    const byTalent = await loadCohortSubmissions(recoFormId, eventId, reco);

    const [answered, silent, masked] = talentIds;
    expect(byTalent.get(answered)?.recoOptionId).toBe(yesOptionId);
    expect(byTalent.has(silent)).toBe(false);
    expect(byTalent.has(masked)).toBe(false);
  });

  it('still lists who answered when the form asks no recommendation', async () => {
    const byTalent = await loadCohortSubmissions(recoFormId, eventId, null);
    const [answered] = talentIds;
    expect(byTalent.get(answered)).toEqual({
      submittedAt: expect.any(Date),
      recoOptionId: null,
    });
  });
});
