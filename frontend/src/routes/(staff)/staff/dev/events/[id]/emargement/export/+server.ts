import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { asciiFilename, buildXlsx, xlsxResponse } from '$lib/server/xlsx';
import { presenceSheet } from '$lib/server/services/eventSheets';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Full-period émargement export: the whole attendance grid of the period
 * (`presenceSheet`), never the on-screen filter.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.EMARGEMENT,
  );

  const sheet = await presenceSheet(
    scopedPrisma(campusId),
    event,
    getCampusTimezone(locals),
  );

  recordUsage(USAGE_FEATURES.DEV_EMARGEMENT_EXPORT, {
    locals,
    eventId: params.id,
  });

  return xlsxResponse(
    buildXlsx(sheet),
    `Emargement - ${asciiFilename(event.titre, 'emargement')}`,
  );
};
