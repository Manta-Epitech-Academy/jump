import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { loadForm } from '$lib/domain/feedbackForms/schema';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Acces refuse.');

  const formId = url.searchParams.get('formId') ?? 'w1';
  const schema = loadForm(formId);
  if (!schema) throw error(400, 'Formulaire inconnu.');

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
    select: { id: true, titre: true },
  });
  if (!event) throw error(404, 'Evenement introuvable.');

  const submissions = await prisma.feedbackSubmission.findMany({
    where: { eventId: params.eventId, formId },
    include: { talent: { select: { prenom: true, nom: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const questions = schema.questions.filter(
    (q) => q.type !== 'gate' && !q.identity,
  );

  const headers = ['Prenom', 'Nom', ...questions.map((q) => q.prompt)];

  const rows = submissions.map((sub) => {
    const answers = sub.answers as Record<string, unknown>;
    return [
      sub.talent.prenom ?? '',
      sub.talent.nom ?? '',
      ...questions.map((q) => {
        const val = answers[q.id];
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'string') return val;
        return '';
      }),
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

  const bom = '\uFEFF';
  const body = bom + csv;

  const filename = `feedback-${formId}-${event.titre.replace(/[^a-zA-Z0-9-_ ]/g, '')}.csv`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
