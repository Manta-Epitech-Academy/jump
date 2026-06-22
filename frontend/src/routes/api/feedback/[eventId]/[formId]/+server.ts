import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import type { Answers } from '$lib/domain/feedbackForms/schema';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';
import { recordSubmission } from '$lib/server/feedbackSubmissions';

export const POST: RequestHandler = async ({ request, locals, params }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorise');
  }

  const graph = await getFormGraphBySlug(params.formId);
  if (
    !graph ||
    graph.status !== 'published' ||
    !graph.allowsAuthenticatedAccess
  ) {
    throw error(404, 'Formulaire introuvable');
  }

  // The submission must belong to a real participation, mirroring the page load.
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
    return json({ message: 'JSON invalide' }, { status: 400 });
  }

  const answers = body.answers;
  if (!answers || typeof answers !== 'object') {
    return json({ message: 'Reponses manquantes' }, { status: 400 });
  }

  try {
    await recordSubmission(graph, answers, {
      source: 'authenticated',
      talentId: locals.talent.id,
      eventId: params.eventId,
    });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? (err.status as number)
        : 500;
    const message =
      err && typeof err === 'object' && 'body' in err
        ? ((err.body as { message?: string })?.message ??
          'Erreur lors de l’enregistrement')
        : 'Erreur lors de l’enregistrement';
    return json({ message }, { status });
  }

  return json({ success: true });
};
