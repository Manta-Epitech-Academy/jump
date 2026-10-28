import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import {
  eventWorkbookSheets,
  planEventWorkbook,
} from '$lib/server/services/eventSheets';
import { asciiFilename, buildXlsx, xlsxResponse } from '$lib/server/xlsx';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * The whole event as one workbook, from its home: one sheet per section the
 * event has (`planEventWorkbook`), each the very sheet its page's own export
 * downloads. Gated like a home page (no module of its own), then sheet by
 * sheet like the section it comes from.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId, 'home');

  const plan = await planEventWorkbook(event);
  const [first, ...rest] = await eventWorkbookSheets(
    scopedPrisma(campusId),
    event,
    getCampusTimezone(locals),
    plan,
  );
  if (!first) {
    throw error(404, "Cet événement n'a aucune section à exporter.");
  }

  recordUsage(USAGE_FEATURES.DEV_EVENT_EXPORT, { locals, eventId: params.id });

  return xlsxResponse(
    buildXlsx(first, ...rest),
    asciiFilename(event.titre, 'evenement'),
  );
};
