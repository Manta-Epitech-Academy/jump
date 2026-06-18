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

  const interview = await prisma.interview.findUnique({
    where: { id: params.id },
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
