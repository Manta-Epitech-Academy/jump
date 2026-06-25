import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';
import { answerCells, buildSubmissionWhere } from '$lib/server/feedbackStats';
import { STAGE_FORM_SLUG } from '$lib/domain/feedback';
import { buildXlsx } from '$lib/server/xlsx';

// Event-scoped XLSX of the bilan responses, the dev-space counterpart of the QR.
// Resolves the form exactly like the page (canonical stage slug, published +
// authenticated) so the export never reports a form the page wouldn't show. The
// route is dev-space + `bilan`-flag gated. XLSX inline strings are inert, so no
// CSV-style formula guard is needed on the untrusted respondent input.
export const GET: RequestHandler = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.BILAN);

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

  const rows = submissions.map((sub) => [
    sub.talent?.prenom ?? sub.respondentFirstName ?? '',
    sub.talent?.nom ?? sub.respondentLastName ?? '',
    sub.talent?.email ?? sub.respondentEmail ?? '',
    ...answerCells(sub.answers, columns),
  ]);

  const xlsx = buildXlsx({
    name: 'Bilan',
    headers,
    rows,
    colWidths: [16, 16, 24, ...columns.map(() => 28)],
  });

  const safeTitle =
    event.titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim() || 'bilan';

  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Bilan - ${safeTitle}.xlsx"`,
    },
  });
};
