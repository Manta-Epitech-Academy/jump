import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getFormGraphBySlug, toFormSchema } from '$lib/server/feedbackForms';

// Public, unauthenticated entry point for a feedback form, shared by link
// (parents, families, an event's audience, or a campus not yet onboarded on
// Jump). The route lives outside every auth route group, so no talent/staff
// session is required. Identity questions are asked (no prefill) and the
// respondent's email is stored on the submission for later reconciliation.
// The legacy /bilan/[slug] path 301-redirects here.
export const load: PageServerLoad = async ({ params }) => {
  const graph = await getFormGraphBySlug(params.slug);
  if (!graph || graph.status !== 'published' || !graph.allowsPublicAccess) {
    throw error(404, 'Formulaire introuvable');
  }

  return {
    formSchema: toFormSchema(graph, 'public'),
    slug: params.slug,
  };
};
