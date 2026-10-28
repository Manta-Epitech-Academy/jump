import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { renderCertificatePreviewPng } from '$lib/server/services/diplomaGenerator';
import {
  loadEventCertificateContext,
  resolveEventDiplomaDesign,
} from '$lib/server/diplomaTemplates';
import {
  PREVIEW_RECIPIENT,
  previewPngResponse,
} from '$lib/server/documentPreview';

// The certificate the event home previews before generating them: this event's
// own design, city, dates and signatories, through the very render
// `diplomes.pdf` prints, for a placeholder name. Gated like the export it
// previews, so it answers only where the export would.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );
  const design = await resolveEventDiplomaDesign(event);
  if (!design) {
    throw error(404, 'Fonctionnalité non disponible pour cet événement.');
  }

  const context = await loadEventCertificateContext(event, campusId);
  const { png } = await renderCertificatePreviewPng(design, {
    ...context,
    students: [PREVIEW_RECIPIENT],
  });
  return previewPngResponse(png);
};
