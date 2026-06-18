import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  generateInterviewPdf,
  interviewPdfFilename,
  interviewPdfSelect,
} from '$lib/server/services/interviewPdfGenerator';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Acces refuse.');

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
