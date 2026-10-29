import type { RequestHandler } from './$types';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { renderBadgePreviewPng } from '$lib/server/services/badgeGenerator';
import {
  PREVIEW_RECIPIENT,
  previewPngResponse,
} from '$lib/server/documentPreview';

// The badge the event home previews before printing the sheet: one badge, cut
// from the very render `badges.pdf` prints, for a placeholder name. Gated like
// the sheet it previews, so it answers only where the sheet would.
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  await loadEventOr404(params.id, getCampusId(locals), EVENT_MODULES.INSCRITS);

  const { png } = await renderBadgePreviewPng({
    ...PREVIEW_RECIPIENT,
    imageRefused: false,
  });
  return previewPngResponse(png);
};
