import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import {
  generateClosingPdf,
  closingPdfFilename,
  closingPdfSelect,
} from '$lib/server/services/closingPdfGenerator';
import { resolveClosingGridById } from '$lib/server/closingTemplates';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * The synthesis PDF of one closing, for the person who conducted it.
 *
 * The same document the admin archive serves, reachable from the page where the
 * closing was conducted. It used to be admin-only, which meant the dev-team
 * member who ran the 1:1 could not print or forward their own synthesis while
 * someone who was not in the room could.
 *
 * Addressed by TALENT, like the conduct route beside it and for the same
 * reason: a closing whose enrolment the Salesforce sync has since pruned has to
 * stay reachable, and `(talentId, eventId)` is the record's own key.
 *
 * The segment is `pdf` and not `synthese.pdf` on purpose. Cloudflare caches by
 * extension, so a `.pdf` route has to defeat it with a per-request query param
 * the way the badge and certificate endpoints do; an extension-less one never
 * enters that cache, so the document stays regenerated from live data with
 * nothing to remember.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);
  const db = scopedPrisma(campusId);

  // Only a finalised closing has a complete synthesis; an in-progress row would
  // render a half-filled document. The page only offers the link once the
  // closing is done, so this scope hardens a hand-typed URL.
  const closing = await db.closing_Record.findFirst({
    where: { talentId: params.talentId, eventId: event.id, status: 'done' },
    select: closingPdfSelect,
  });
  if (!closing) throw error(404, 'Closing introuvable.');

  // The grid the record was conducted WITH, not the one its event points at
  // today: retargeting an event must never change how a past closing reads.
  const grid = await resolveClosingGridById(closing.templateId);
  if (!grid) throw error(404, 'Grille de closing introuvable.');

  const pdf = await generateClosingPdf(closing, grid);
  const filename = closingPdfFilename(closing);

  // Recorded here rather than at the top: a document feature counts once the
  // document exists, so neither of the 404s above lands in the figure.
  recordUsage(USAGE_FEATURES.DEV_CLOSING_PDF_SINGLE, {
    locals,
    eventId: event.id,
  });

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
};
