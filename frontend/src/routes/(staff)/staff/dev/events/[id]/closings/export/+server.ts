import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
} from '$lib/server/services/stageContext';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { loadClosingsSheet } from '$lib/server/services/closingsSheet';
import { asciiFilename, xlsxAttachment } from '$lib/server/attachments';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * One event's closings as an xlsx.
 *
 * The last dev surface without an export, which is what the dev team reported
 * after the stage. Whole-event by design and with no filter of its own: the
 * roster it lists is the one the closings page lists, so there is nothing on
 * screen for it to follow.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.CLOSINGS);

  const sheet = await loadClosingsSheet(
    scopedPrisma(campusId),
    event,
    getCampusTimezone(locals),
  );

  recordUsage(USAGE_FEATURES.DEV_CLOSINGS_EXPORT, {
    locals,
    eventId: event.id,
  });

  return xlsxAttachment(
    sheet,
    `Closings - ${asciiFilename(event.titre, 'closings')}.xlsx`,
  );
};
