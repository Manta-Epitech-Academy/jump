import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { Answers } from '$lib/domain/feedbackForms/schema';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';
import { recordSubmission } from '$lib/server/feedbackSubmissions';

// Public submit endpoint for a feedback form (no auth). The respondent is not a
// Jump account: their self-reported identity is stored on the submission and
// reconciled to a Talent by email later. The legacy /api/bilan/[slug] path
// 308-redirects here.
export const POST: RequestHandler = async ({ request, params }) => {
  const graph = await getFormGraphBySlug(params.slug);
  if (!graph || graph.status !== 'published' || !graph.allowsPublicAccess) {
    return json({ message: 'Formulaire introuvable' }, { status: 404 });
  }

  let body: { answers?: Answers };
  try {
    body = await request.json();
  } catch {
    return json({ message: 'JSON invalide' }, { status: 400 });
  }

  const answers = body.answers;
  if (!answers || typeof answers !== 'object') {
    return json({ message: 'Réponses manquantes' }, { status: 400 });
  }

  try {
    await recordSubmission(graph, answers, { source: 'public' });
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
