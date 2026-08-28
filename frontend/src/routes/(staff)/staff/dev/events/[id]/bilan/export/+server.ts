import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import { answerCells, buildSubmissionWhere } from '$lib/server/feedbackStats';
import { buildXlsx } from '$lib/server/xlsx';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Event-scoped XLSX of the feedback responses, the dev-space counterpart of the
// QR. Resolves the event's form exactly like the page (override else type
// default, published + authenticated) so the export never reports a form the
// page wouldn't show. The route is dev-space + `bilan`-module gated. XLSX inline
// strings are inert, so no CSV-style formula guard is needed on the untrusted
// respondent input.
export const GET: RequestHandler = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.BILAN);

  const graph = await resolvePublishedEventForm(event);
  if (!graph) {
    throw error(404, 'Aucun formulaire de feedback.');
  }

  const submissions = await prisma.feedback_Submission.findMany({
    where: buildSubmissionWhere(graph.id, { eventId: event.id }),
    orderBy: { submittedAt: 'asc' },
    include: {
      talent: {
        select: { prenom: true, nom: true, user: { select: { email: true } } },
      },
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
    sub.talent?.user?.email ?? sub.respondentEmail ?? '',
    ...answerCells(sub.answers, columns),
  ]);

  const xlsx = buildXlsx({
    name: 'Reponses',
    headers,
    rows,
    colWidths: [16, 16, 24, ...columns.map(() => 28)],
  });

  // ASCII-only filename label, fed by the form title (whatever form the event
  // uses) and the event title, so the download names itself per attached form.
  const ascii = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim();
  const formLabel = ascii(graph.title) || 'Feedback';
  const eventLabel = ascii(event.titre) || 'evenement';

  recordUsage(USAGE_FEATURES.DEV_BILAN_EXPORT, { locals, eventId: params.id });

  return new Response(xlsx.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${formLabel} - ${eventLabel}.xlsx"`,
    },
  });
};
