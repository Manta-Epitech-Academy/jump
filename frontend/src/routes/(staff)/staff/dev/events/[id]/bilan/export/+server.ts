import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';
import { buildSubmissionWhere } from '$lib/server/feedbackStats';
import { STAGE_FORM_SLUG } from '$lib/domain/feedback';
import { csvResponse } from '$lib/server/csv';

// Event-scoped CSV of the bilan responses, the dev-space counterpart of the QR.
// Resolves the form exactly like the page (canonical stage slug, published +
// authenticated) so the export never reports a form the page wouldn't show. The
// route is dev-space + `bilan`-flag gated; cells go through `csvResponse`, which
// formula-guards every value (submissions carry untrusted respondent input).
export const GET: RequestHandler = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  requireFlag(locals, 'bilan');
  const event = await loadEventOr404(params.id, campusId);

  const graph = await getFormGraphBySlug(STAGE_FORM_SLUG);
  if (
    !graph ||
    graph.status !== 'published' ||
    !graph.allowsAuthenticatedAccess
  ) {
    throw error(404, 'Aucun formulaire de bilan.');
  }

  const submissions = await prisma.feedback_Submission.findMany({
    where: buildSubmissionWhere(graph.id, { eventId: event.id }),
    orderBy: { submittedAt: 'asc' },
    include: {
      talent: { select: { prenom: true, nom: true, email: true } },
      answers: {
        select: {
          questionId: true,
          freeText: true,
          selectedOptions: { select: { option: { select: { label: true } } } },
        },
      },
    },
  });

  const columns = graph.questions.filter((q) => q.identityField == null);
  const headers = ['Prenom', 'Nom', 'E-mail', ...columns.map((q) => q.prompt)];

  const rows = submissions.map((sub) => {
    const byQuestion = new Map<string, string>();
    for (const a of sub.answers) {
      byQuestion.set(
        a.questionId,
        a.freeText ?? a.selectedOptions.map((s) => s.option.label).join(', '),
      );
    }
    return [
      sub.talent?.prenom ?? sub.respondentFirstName ?? '',
      sub.talent?.nom ?? sub.respondentLastName ?? '',
      sub.talent?.email ?? sub.respondentEmail ?? '',
      ...columns.map((q) => byQuestion.get(q.id) ?? ''),
    ];
  });

  return csvResponse(`bilan-${graph.slug}.csv`, headers, rows);
};
