import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '#lib/server/db.ts';
import { getFormGraphBySlug } from '#lib/server/feedbackForms.ts';
import { recordSubmission } from '#lib/server/feedbackSubmissions.ts';
import { gatedCommand } from '#lib/server/remoteFunctions.ts';

/**
 * A talent's answers to an event's feedback form, sent by the chat on
 * `/feedback/[eventId]/[formId]` once its last question is answered.
 *
 * Gated like the page: a talent whose app is open, so one who has not signed
 * the charte stores nothing here either. Each answer is checked against its
 * question by `recordSubmission`; the schema only holds the shape the chat
 * sends. The public twin, `/api/f/[slug]`, stays a route: its respondent has no
 * account, and a legacy path still redirects to it.
 */
export const submitFeedback = gatedCommand(
  { talent: 'appOpen' },
  z.object({
    eventId: z.string().min(1),
    formId: z.string().min(1),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  }),
  async ({ eventId, formId, answers }, { talent }) => {
    const graph = await getFormGraphBySlug(formId);
    if (
      !graph ||
      graph.status !== 'published' ||
      !graph.allowsAuthenticatedAccess
    ) {
      error(404, 'Formulaire introuvable.');
    }

    // The submission must belong to a real participation, as the page's load
    // requires before it shows the form.
    const participation = await prisma.participation.findFirst({
      where: { eventId, talentId: talent.id },
      select: { id: true },
    });
    if (!participation) error(404, 'Participation introuvable.');

    await recordSubmission(graph, answers, {
      source: 'authenticated',
      talentId: talent.id,
      eventId,
    });
  },
);
