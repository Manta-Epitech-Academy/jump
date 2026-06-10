import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  loadForm,
  validateAnswer,
  type Answers,
} from '$lib/domain/feedbackForms/schema';
import { buildPrefill } from '$lib/domain/feedback';

const VALID_FORM_IDS = ['w1', 'w2'];

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorise');
  }

  if (!VALID_FORM_IDS.includes(params.formId)) {
    throw error(404, 'Formulaire introuvable');
  }

  const formSchema = loadForm(params.formId);
  if (!formSchema) {
    throw error(404, 'Formulaire introuvable');
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
  });
  if (!event) {
    throw error(404, 'Evenement introuvable');
  }

  const participation = await prisma.participation.findFirst({
    where: { eventId: params.eventId, talentId: locals.talent.id },
    select: { campusId: true },
  });
  if (!participation) {
    throw error(404, 'Participation introuvable');
  }

  const existing = await prisma.feedbackSubmission.findUnique({
    where: {
      eventId_talentId_formId: {
        eventId: params.eventId,
        talentId: locals.talent.id,
        formId: params.formId,
      },
    },
  });
  if (existing) {
    throw redirect(303, '/');
  }

  const campus = await prisma.campus.findUnique({
    where: { id: participation.campusId },
    select: { name: true },
  });

  const prefill = buildPrefill(locals.talent, campus?.name ?? '');

  return {
    formSchema,
    prefill,
    eventId: params.eventId,
    formId: params.formId,
  };
};

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorise');
    }

    const formSchema = loadForm(params.formId);
    if (!formSchema) {
      throw error(404, 'Formulaire introuvable');
    }

    let body: { answers?: Answers };
    try {
      body = await request.json();
    } catch {
      return fail(400, { message: 'JSON invalide' });
    }

    const answers = body.answers;
    if (!answers || typeof answers !== 'object') {
      return fail(400, { message: 'Reponses manquantes' });
    }

    const validationErrors: string[] = [];
    for (const q of formSchema.questions) {
      const err = validateAnswer(q, answers[q.id]);
      if (err) {
        validationErrors.push(`${q.id}: ${err}`);
      }
    }

    if (validationErrors.length > 0) {
      return fail(400, { validationErrors });
    }

    const eventId = params.eventId;
    const formId = params.formId;

    await prisma.feedbackSubmission.upsert({
      where: {
        eventId_talentId_formId: {
          eventId,
          talentId: locals.talent.id,
          formId,
        },
      },
      create: {
        eventId,
        talentId: locals.talent.id,
        formId,
        answers: answers as object,
      },
      update: {
        answers: answers as object,
      },
    });

    return { success: true };
  },
};
