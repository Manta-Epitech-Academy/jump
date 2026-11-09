import type { RequestHandler } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  eventModuleSettings,
  loadEventOr404,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { INSCRITS_VIEW } from '$lib/domain/inscritsView';
import { rosterFacets, shownInscrits } from '$lib/domain/inscritsRoster';
import { asciiFilename, buildXlsx, xlsxResponse } from '$lib/server/xlsx';
import { inscritsSheet } from '$lib/server/services/eventSheets';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

/**
 * The Inscrits list as a workbook, exactly as the page shows it: the export is
 * a link carrying the page's own address (filters, sort, search,
 * `$lib/domain/inscritsView`), and the rows are narrowed here with the rule the
 * page applies (`shownInscrits`), over the cohort reloaded campus- and
 * event-scoped from the database. A plain download, like the event home's
 * whole-event export, so it can sit on the page's title line as a tile. The
 * sheet itself is `inscritsSheet`, the one the whole-event export carries too.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );

  const view = INSCRITS_VIEW.parse(url.searchParams);
  const showStatut = eventModuleSettings(
    event,
    EVENT_MODULES.INSCRITS,
  ).showStatutColumn;
  const sheet = await inscritsSheet(
    scopedPrisma(campusId),
    event,
    getCampusTimezone(locals),
    {
      narrow: (rows) =>
        shownInscrits(
          rows,
          rosterFacets(rows, { showStatut }, view),
          view,
          url.searchParams.get('q') ?? '',
        ),
    },
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
