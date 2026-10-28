import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  eventModuleSettings,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { loadInscritsCohort } from '$lib/server/services/inscritsCohort';
import type { InscritsCohort } from '$lib/domain/inscritsRoster';

// The load reads nothing off the address on purpose. The page's filters, sort
// and search all live in the querystring (`$lib/domain/inscritsView`) and are
// applied in the browser over the whole cohort, so a filter change is a
// navigation that does not re-run this query: SvelteKit re-runs a load only
// for the `url` parts it read.
export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(
    params.id,
    campusId,
    EVENT_MODULES.INSCRITS,
  );
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  // Stream the cohort: the page shell (header) paints immediately
  // while this resolves, instead of the client navigation blocking on it.
  const cohort: Promise<InscritsCohort> = loadInscritsCohort(
    db,
    event,
    timezone,
  );

  return {
    event,
    // Inscrits sub-option: hide the dossier/statut funnel column for events whose
    // campus doesn't onboard. Cheap shell value, so it rides the first paint.
    showStatutColumn: eventModuleSettings(event, EVENT_MODULES.INSCRITS)
      .showStatutColumn,
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};
