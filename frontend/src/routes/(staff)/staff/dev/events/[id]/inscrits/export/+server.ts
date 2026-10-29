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
import { inscritsSheet } from '$lib/server/services/eventSheets';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * Filtered-cohort XLSX export. The inscrits page filters/sorts ~200 rows client
 * side, so it POSTs the talent ids it is currently showing (in display order);
 * the server rebuilds those rows with the page's own loader, campus + event
 * scoped and recomputed from the DB (never trusting the client), then streams
 * the workbook. The sheet itself is `inscritsSheet`, the one the event home's
 * whole-event export carries too.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );

  const body = (await request.json().catch(() => null)) as {
    talentIds?: unknown;
  } | null;
  const talentIds = Array.isArray(body?.talentIds)
    ? body.talentIds.filter((x): x is string => typeof x === 'string')
    : [];

  const sheet = await inscritsSheet(
    scopedPrisma(campusId),
    event,
    getCampusTimezone(locals),
    { talentIds },
  );

  recordUsage(USAGE_FEATURES.DEV_INSCRITS_EXPORT, {
    locals,
    eventId: params.id,
  });

  return xlsxResponse(
    buildXlsx(sheet),
    `Inscrits - ${asciiFilename(event.titre, 'inscrits')}`,
  );
};
