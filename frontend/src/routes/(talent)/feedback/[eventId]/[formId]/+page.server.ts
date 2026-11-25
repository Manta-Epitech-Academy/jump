import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { eventPublicName, UNNAMED_EVENT_NAME } from '#lib/domain/event.ts';
import {
  feedbackParticipationWhere,
  getFormGraphBySlug,
  toFormSchema,
} from '#lib/server/feedbackForms.ts';

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

  const participation = await prisma.participation.findFirst({
    where: {
      eventId: params.eventId,
      ...feedbackParticipationWhere(locals.talent.id),
    },
    select: { event: { select: { publicName: true } } },
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

  return {
    // Authenticated audience: identity questions are dropped (Jump already holds
    // the talent's identity), so no prefill is needed.
    formSchema: toFormSchema(graph, 'authenticated'),
    // Seeds the bot's interpolated copy ("Salut {prenom} !"); the identity
    // questions are skipped, so this is the only source for a connected talent.
    identity: {
      prenom: locals.talent.prenom,
      nom: locals.talent.nom,
      civilite: locals.talent.civilite ?? undefined,
      campus: locals.talentCampusName ?? undefined,
    },
    eventId: params.eventId,
    // What the duck names when he thanks the talent for answering (#540).
    eventName: eventPublicName(participation.event) ?? UNNAMED_EVENT_NAME,
    formId: params.formId,
  };
};
