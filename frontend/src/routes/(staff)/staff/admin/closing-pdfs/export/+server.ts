import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { closingPdfSelect } from '$lib/server/services/closingPdfGenerator';
import { streamClosingPdfArchive } from '$lib/server/services/closingPdfArchive';
import { resolveClosingGrids } from '$lib/server/closingTemplates';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Parse a `from`/`to` query param into an instant. The client sends full ISO
// instants; an unparseable value is ignored rather than erroring, degrading to
// a wider export instead of a 500.
function parseInstant(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

export const GET: RequestHandler = async ({ url, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_CLOSING_PDFS_EXPORT, { locals });
  // The /staff/admin layout guard already redirects non-admins; this is defence
  // in depth for an endpoint that streams minors' closing data.
  const staffProfile = locals.staffProfile;
  if (staffProfile?.staffRole !== 'admin') throw error(403, 'Accès refusé.');

  const from = parseInstant(url.searchParams.get('from'));
  const to = parseInstant(url.searchParams.get('to'));

  const where: Prisma.Closing_RecordWhereInput = { status: 'done' };
  if (from || to) {
    where.conductedAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
  }

  // Whether this download advances the admin's export high-water mark. Only an
  // open-ended "everything up to now" archive may: an upper time bound makes it
  // a historical window, not "up to now". The client sets `advance` on the
  // all-time and "depuis le dernier export" downloads; this check is the safety
  // rail so a stray flag on a windowed link can't corrupt the mark.
  const advanceMark = url.searchParams.get('advance') === '1' && !to;

  // One clock for the request. The mark, when advanced, is set to this
  // pre-query instant so a closing finalised mid-export is re-offered next
  // time rather than skipped.
  const exportedAt = new Date();

  const closings = await prisma.closing_Record.findMany({
    where,
    select: closingPdfSelect,
    orderBy: { conductedAt: 'desc' },
  });

  if (closings.length === 0) {
    throw error(404, 'Aucun closing à exporter.');
  }

  // One resolve per distinct grid rather than one per record: the archive spans
  // hundreds of closings and a handful of grids.
  const grids = await resolveClosingGrids(closings.map((c) => c.templateId));

  const stream = streamClosingPdfArchive(closings, grids, {
    // Record an "up to now" pass AFTER assembly, anchored to the request start
    // so a closing finalised mid-export is re-offered next time. This tracks
    // assembly, not client delivery (a streamed download can't confirm the
    // latter); the mark is a convenience filter, not a receipt, and the
    // all-time export ignores it. Fire-and-forget; a failed write safely
    // re-offers next time.
    onAssembled: () => {
      if (!advanceMark) return;
      void prisma.staffProfile
        .update({
          where: { id: staffProfile.id },
          data: { closingDocsExportedAt: exportedAt },
        })
        .catch((err) => console.error('[closing-zip] mark export failed', err));
    },
  });

  let stem = 'closings';
  if (from && to) stem += `-${ymd(from)}_${ymd(to)}`;
  else if (from) stem += `-depuis-${ymd(from)}`;
  else stem += `-${ymd(exportedAt)}`;

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${stem}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
};
