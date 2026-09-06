import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { csvResponse } from '$lib/server/csv';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';
import { getFormGraphById } from '$lib/server/feedbackForms';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  answerCells,
  buildSubmissionWhere,
  eventAxisScope,
} from '$lib/server/feedbackStats';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_FEEDBACK_RESPONSES_EXPORT, { locals });
  requireAdmin(locals);

  const graph = await getFormGraphById(params.id);
  if (!graph) throw error(404, 'Formulaire introuvable.');

  const campusName = url.searchParams.get('campus') || undefined;
  const eventParam = url.searchParams.get('event') || 'all';
  // Same event axis as the page (a specific event, the public hors-événement
  // bucket, or everything) so a scoped on-screen view exports the same slice the
  // admin is looking at, not the whole pile.
  const scope = { campusName, ...eventAxisScope(eventParam) };

  const submissions = await prisma.feedback_Submission.findMany({
    where: buildSubmissionWhere(graph.id, scope),
    orderBy: { submittedAt: 'asc' },
    include: {
      talent: {
        select: { prenom: true, nom: true, user: { select: { email: true } } },
      },
      event: {
        select: {
          titre: true,
          publicName: true,
          campus: { select: { name: true } },
        },
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

  // The event column makes every row differentiable even in an unfiltered export
  // (the whole reason a shared form's pile was useless): each authenticated row
  // names its event; public rows have none.
  const headers = [
    'Source',
    'Evenement',
    'Campus',
    'E-mail',
    'Prenom',
    'Nom',
    ...columns.map((q) => q.prompt),
  ];

  const rows = submissions.map((sub) => {
    const isPublic = sub.source === 'public';
    const eventName = sub.event
      ? sub.event.publicName?.trim() || sub.event.titre
      : '';
    return [
      isPublic ? 'Public' : 'Authentifié',
      eventName,
      sub.event?.campus.name ?? sub.respondentCampusLabel ?? '',
      sub.talent?.user?.email ?? sub.respondentEmail ?? '',
      sub.talent?.prenom ?? sub.respondentFirstName ?? '',
      sub.talent?.nom ?? sub.respondentLastName ?? '',
      ...answerCells(sub.answers, columns),
    ];
  });

  // Name the file after the scope so a per-event download is self-describing.
  const ascii = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim();
  let suffix = '';
  if (eventParam === 'public') suffix = '-public';
  else if (eventParam !== 'all') {
    const name = submissions[0]?.event
      ? submissions[0].event.publicName?.trim() || submissions[0].event.titre
      : '';
    if (name) suffix = `-${ascii(name)}`;
  }

  // csvResponse escapes and formula-guards every cell; respondent free text is
  // untrusted public input, so never hand-roll the escaping here.
  return csvResponse(`reponses-${graph.slug}${suffix}.csv`, headers, rows);
};
