import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getFormGraphBySlug } from '$lib/server/feedbackForms';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Acces refuse.');

  const slug = url.searchParams.get('formId') ?? 'w1';
  const graph = await getFormGraphBySlug(slug);
  if (!graph) throw error(400, 'Formulaire inconnu.');

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
    select: { id: true, titre: true },
  });
  if (!event) throw error(404, 'Evenement introuvable.');

  const submissions = await prisma.feedback_Submission.findMany({
    where: { formId: graph.id, eventId: params.eventId },
    include: {
      talent: { select: { prenom: true, nom: true } },
      answers: {
        select: {
          questionId: true,
          freeText: true,
          selectedOptions: { select: { option: { select: { label: true } } } },
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const columns = graph.questions.filter(
    (q) => q.type !== 'gate' && !q.identity,
  );

  const headers = ['Prenom', 'Nom', ...columns.map((q) => q.prompt)];

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
      ...columns.map((q) => byQuestion.get(q.id) ?? ''),
    ];
  });

  function csvEscape(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  const body = '\uFEFF' + csv;
  const filename = `feedback-${slug}-${event.titre.replace(/[^a-zA-Z0-9-_ ]/g, '')}.csv`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
