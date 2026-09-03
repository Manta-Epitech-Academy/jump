import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { closingPdfSelect } from '$lib/server/services/closingPdfGenerator';
import { streamClosingPdfArchive } from '$lib/server/services/closingPdfArchive';
import { resolveClosingGrids } from '$lib/server/closingTemplates';
import { asciiFilename, zipAttachment } from '$lib/server/attachments';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Every finalised closing of one event, as an archive of synthesis PDFs.
 *
 * The same archive the admin space builds, scoped to the event a dev-team member
 * is actually working on and read through `scopedPrisma`, so it can only ever
 * contain their own campus's closings.
 *
 * No date window and no "since my last export" mark, which the admin archive
 * both has: an event IS the window, so a rolling seven days would answer a
 * question nobody asks of one, and a high-water mark per person over a corpus
 * that stops growing when the event ends would only ever say "nothing new".
 *
 * `archive` rather than `pdfs.zip`, for the reason the single PDF is served from
 * `pdf`: an extension-less path never enters Cloudflare's cache-by-extension, so
 * an archive assembled from live records cannot be served from one.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);
  const db = scopedPrisma(campusId);

  // Only finalised closings: an in-progress one would render a half-filled
  // document, which is the same scope the single-PDF route applies.
  const closings = await db.closing_Record.findMany({
    where: { eventId: event.id, status: 'done' },
    select: closingPdfSelect,
    orderBy: { conductedAt: 'desc' },
  });

  if (closings.length === 0) {
    throw error(404, 'Aucun closing finalisé à exporter pour cet événement.');
  }

  // One resolve per distinct grid rather than one per record. An event usually
  // has one, and two when it has been retargeted mid-run.
  const grids = await resolveClosingGrids(closings.map((c) => c.templateId));

  const stream = streamClosingPdfArchive(closings, grids, {
    // Once the archive exists, never at construction: its own definition says
    // "une par archive assemblée", and a document feature counts the artifact
    // rather than the request. `onAssembled` is the hook the admin route uses
    // for its own after-assembly write.
    onAssembled: () =>
      recordUsage(USAGE_FEATURES.DEV_CLOSINGS_PDFS_EXPORT, {
        locals,
        eventId: event.id,
      }),
  });

  return zipAttachment(
    stream,
    `Closings - ${asciiFilename(event.titre, 'closings')}.zip`,
  );
};
