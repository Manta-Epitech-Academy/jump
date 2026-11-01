import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getFormGraphById, toFormSchema } from '$lib/server/feedbackForms';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';

// A form as its respondents meet it, drafts included: the page an admin opens
// to see what `write_feedback_form` wrote, and the one `config_feedback_forms`
// links to. Both audiences are projected here, since a connected talent is
// never asked the identity questions a public respondent is.
export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);

  const graph = await getFormGraphById(params.id);
  if (!graph) throw error(404, 'Formulaire introuvable');

  return {
    form: {
      id: graph.id,
      title: graph.title,
      status: graph.status,
      personaName: graph.personaName,
      personaIconKey: graph.personaIconKey,
      allowsPublicAccess: graph.allowsPublicAccess,
      allowsAuthenticatedAccess: graph.allowsAuthenticatedAccess,
    },
    schemas: {
      authenticated: toFormSchema(graph, 'authenticated'),
      public: toFormSchema(graph, 'public'),
    },
  };
};
