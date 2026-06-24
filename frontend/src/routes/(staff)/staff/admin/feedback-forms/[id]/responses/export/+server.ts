import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { csvResponse } from '$lib/server/csv';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';
import { getFormGraphById } from '$lib/server/feedbackForms';
import { answerCells, buildSubmissionWhere } from '$lib/server/feedbackStats';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  requireAdmin(locals);

  const graph = await getFormGraphById(params.id);
  if (!graph) throw error(404, 'Formulaire introuvable.');

  const campusName = url.searchParams.get('campus') || undefined;
  const submissions = await prisma.feedback_Submission.findMany({
    where: buildSubmissionWhere(graph.id, { campusName }),
    orderBy: { submittedAt: 'asc' },
    include: {
      talent: { select: { prenom: true, nom: true, email: true } },
      event: { select: { campus: { select: { name: true } } } },
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

  const headers = [
    'Source',
    'Campus',
    'E-mail',
    'Prenom',
    'Nom',
    ...columns.map((q) => q.prompt),
  ];

  const rows = submissions.map((sub) => {
    const isPublic = sub.source === 'public';
    return [
      isPublic ? 'Public' : 'Authentifié',
      sub.event?.campus.name ?? sub.respondentCampusLabel ?? '',
      sub.talent?.email ?? sub.respondentEmail ?? '',
      sub.talent?.prenom ?? sub.respondentFirstName ?? '',
      sub.talent?.nom ?? sub.respondentLastName ?? '',
      ...answerCells(sub.answers, columns),
    ];
  });

  // csvResponse escapes and formula-guards every cell; respondent free text is
  // untrusted public input, so never hand-roll the escaping here.
  return csvResponse(`reponses-${graph.slug}.csv`, headers, rows);
};
