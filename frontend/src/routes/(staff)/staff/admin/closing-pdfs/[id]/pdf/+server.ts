import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  generateClosingPdf,
  closingPdfFilename,
  closingPdfSelect,
} from '$lib/server/services/closingPdfGenerator';
import { resolveClosingGridById } from '$lib/server/closingTemplates';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const GET: RequestHandler = async ({ params, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_CLOSING_PDF_SINGLE, { locals });
  // The /staff/admin layout guard already redirects non-admins; this is defence
  // in depth for an endpoint that streams a minor's closing data.
  if (locals.staffProfile?.staffRole !== 'admin') {
    throw error(403, 'Accès refusé.');
  }

  // Only a finalised closing has a complete synthesis; an in-progress row would
  // render a half-filled PDF. The list only links done closings, so this scope
  // hardens a hand-typed URL. findFirst, since status isn't a unique key.
  const closing = await prisma.closing_Record.findFirst({
    where: { id: params.id, status: 'done' },
    select: closingPdfSelect,
  });

  if (!closing) throw error(404, 'Closing introuvable.');

  // The grid the record was conducted WITH, not the one its event points at
  // today: retargeting an event must never change how a past closing reads.
  const grid = await resolveClosingGridById(closing.templateId);
  if (!grid) throw error(404, 'Grille de closing introuvable.');

  const pdf = await generateClosingPdf(closing, grid);
  const filename = closingPdfFilename(closing);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
};
