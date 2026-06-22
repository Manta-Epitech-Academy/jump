import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import type { Answers } from '$lib/domain/feedbackForms/schema';
import { buildPrefill } from '$lib/domain/feedback';
import { getFormGraphBySlug, toFormSchema } from '$lib/server/feedbackForms';
import { recordSubmission } from '$lib/server/feedbackSubmissions';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const graph = await getFormGraphBySlug(params.formId);
  if (
    !graph ||
    graph.status !== 'published' ||
    !graph.allowsAuthenticatedAccess
  ) {
    throw error(404, 'Formulaire introuvable');
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
  });
  if (!event) {
    throw error(404, 'Événement introuvable');
  }

  const participation = await prisma.participation.findFirst({
    where: { eventId: params.eventId, talentId: locals.talent.id },
    select: { campusId: true },
  });
  if (!participation) {
    throw error(404, 'Participation introuvable');
  }

  const existing = await prisma.feedback_Submission.findUnique({
    where: {
      formId_eventId_talentId: {
        formId: graph.id,
        eventId: params.eventId,
        talentId: locals.talent.id,
      },
    },
    select: { id: true },
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
    formSchema: toFormSchema(graph),
    prefill,
    eventId: params.eventId,
    formId: params.formId,
  };
};

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    if (!locals.talent) {
      throw error(401, 'Non autorisé');
    }

    const graph = await getFormGraphBySlug(params.formId);
    if (
      !graph ||
      graph.status !== 'published' ||
      !graph.allowsAuthenticatedAccess
    ) {
      throw error(404, 'Formulaire introuvable');
    }

    // Mirror the load guard: a talent may only submit for an event they took
    // part in, else a crafted POST could inject a response into any event's
    // bilan (the page load enforces this, but the action is reachable directly).
    const participation = await prisma.participation.findFirst({
      where: { eventId: params.eventId, talentId: locals.talent.id },
      select: { id: true },
    });
    if (!participation) {
      throw error(404, 'Participation introuvable');
    }

    let body: { answers?: Answers };
    try {
      body = await request.json();
    } catch {
      return fail(400, { message: 'JSON invalide' });
    }

    const answers = body.answers;
    if (!answers || typeof answers !== 'object') {
      return fail(400, { message: 'Réponses manquantes' });
    }

    try {
      await recordSubmission(graph, answers, {
        source: 'authenticated',
        talentId: locals.talent.id,
        eventId: params.eventId,
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'body' in err
          ? ((err.body as { message?: string })?.message ??
            'Erreur lors de l’enregistrement')
          : 'Erreur lors de l’enregistrement';
      return fail(400, { message });
    }

    return { success: true };
  },
};
