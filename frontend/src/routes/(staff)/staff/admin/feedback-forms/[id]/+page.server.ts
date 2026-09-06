import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getFormGraphById, countSubmissions } from '$lib/server/feedbackForms';
import { requireAdmin, duplicateForm } from '$lib/server/feedbackFormsAdmin';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  requireAdmin(locals);
  depends('admin:feedback-form');

  const graph = await getFormGraphById(params.id);
  if (!graph) throw error(404, 'Formulaire introuvable');

  const submissionCount = await countSubmissions(graph.id);

  return {
    locked: submissionCount > 0,
    submissionCount,
    form: {
      id: graph.id,
      slug: graph.slug,
      title: graph.title,
      intro: graph.intro,
      outro: graph.outro,
      personaName: graph.personaName,
      personaIconKey: graph.personaIconKey,
      status: graph.status,
      allowsAuthenticatedAccess: graph.allowsAuthenticatedAccess,
      allowsPublicAccess: graph.allowsPublicAccess,
      dashboardNudge: graph.dashboardNudge,
    },
    sections: graph.sections.map((s) => ({
      id: s.id,
      title: s.title,
      intro: s.intro,
      position: s.position,
    })),
    questions: graph.questions.map((q) => ({
      id: q.id,
      key: q.key,
      position: q.position,
      sectionId: q.sectionId,
      prompt: q.prompt,
      type: q.type,
      required: q.required,
      identityField: q.identityField,
      inputKind: q.inputKind,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      placeholder: q.placeholder,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        kind: o.kind,
        position: o.position,
        reaction: o.reaction,
      })),
    })),
  };
};

export const actions: Actions = {
  // Escape hatch for a locked form: clone it into a fresh editable draft and
  // jump straight to the copy's editor.
  duplicate: async ({ params, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_FORM_WRITE, { locals });
    const { staffId } = requireAdmin(locals);
    const { id } = await duplicateForm(staffId, params.id);
    throw redirect(303, `/staff/admin/feedback-forms/${id}`);
  },
};
