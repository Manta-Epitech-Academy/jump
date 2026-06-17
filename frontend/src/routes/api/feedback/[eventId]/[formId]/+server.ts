import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  loadForm,
  validateAnswer,
  type Answers,
} from '$lib/domain/feedbackForms/schema';

import { STAGE_FORM_ID } from '$lib/domain/feedback';

const VALID_FORM_IDS = [STAGE_FORM_ID];

export const POST: RequestHandler = async ({ request, locals, params }) => {
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

  let body: { answers?: Answers };
  try {
    body = await request.json();
  } catch {
    return json({ message: 'JSON invalide' }, { status: 400 });
  }

  const answers = body.answers;
  if (!answers || typeof answers !== 'object') {
    return json({ message: 'Reponses manquantes' }, { status: 400 });
  }

  await prisma.feedbackSubmission.upsert({
    where: {
      eventId_talentId_formId: {
        eventId: params.eventId,
        talentId: locals.talent.id,
        formId: params.formId,
      },
    },
    create: {
      eventId: params.eventId,
      talentId: locals.talent.id,
      formId: params.formId,
      answers: answers as object,
    },
    update: {
      answers: answers as object,
    },
  });

  return json({ success: true });
};
