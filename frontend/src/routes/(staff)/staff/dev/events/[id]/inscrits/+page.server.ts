import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  eventEndOrDefault,
  eventModuleSettings,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolveEventDiplomaIdentity } from '$lib/server/diplomaTemplates';
import {
  getLifecycleBounds,
  getEventStatus,
  applyPhaseOverride,
} from '$lib/domain/eventLifecycle';
import { effectiveStartMinutes } from '$lib/domain/event';
import { composeEventStartInstant } from '$lib/server/eventTime';
import { stageCountdown } from '$lib/domain/eventPresence';
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

  // Stage countdown context (same source as the dashboard prep hero): the phase
  // the workspace is showing, the effective opening instant, and the day index
  // while the stage runs.
  const now = new Date();
  const bounds = getLifecycleBounds(timezone, now);
  const status = applyPhaseOverride(
    getEventStatus(event, bounds),
    locals.stagePhaseOverride,
  );
  const eventEnd = eventEndOrDefault(event);
  const { dayN, totalDays } = stageCountdown(event, timezone, now);
  const countdown = {
    status,
    openDate: composeEventStartInstant(
      event.date,
      effectiveStartMinutes(event.startMinutes),
      timezone,
    ),
    startMinutes: event.startMinutes,
    endDate: eventEnd,
    dayN,
    totalDays,
  };

  // Stream the cohort: the page shell (header + countdown) paints immediately
  // while this resolves, instead of the client navigation blocking on it.
  const cohort: Promise<InscritsCohort> = loadInscritsCohort(
    db,
    event,
    timezone,
  );

  return {
    event,
    timezone,
    countdown,
    // Inscrits sub-option: hide the dossier/statut funnel column for events whose
    // campus doesn't onboard. Cheap shell value, so it rides the first paint.
    showStatutColumn: eventModuleSettings(event, EVENT_MODULES.INSCRITS)
      .showStatutColumn,
    // Which certificate this event issues, or null when it issues none, which is
    // what hides the export. Only the identity: the page needs the label to name
    // the download, never the design's kilobytes of CSS.
    diploma: await resolveEventDiplomaIdentity(event),
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};
