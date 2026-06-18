import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  generateInterviewPdf,
  interviewPdfFilename,
  interviewPdfSelect,
} from '$lib/server/services/interviewPdfGenerator';

export const GET: RequestHandler = async ({ params, locals }) => {
  // The /staff/admin layout guard already redirects non-admins; this is defence
  // in depth for an endpoint that streams a minor's interview data.
  if (locals.staffProfile?.staffRole !== 'admin') {
    throw error(403, 'Accès refusé.');
  }

  // Only a finalized interview has a complete synthesis; an in-progress row
  // would render a half-filled PDF. The list only links done interviews, so this
  // scope hardens a hand-typed URL. findFirst, since status isn't a unique key.
  const interview = await prisma.interview.findFirst({
    where: { id: params.id, status: 'done' },
    select: interviewPdfSelect,
  });

  if (!interview) throw error(404, 'Entretien introuvable.');

  const pdf = await generateInterviewPdf(interview);
  const filename = interviewPdfFilename(interview);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
};
