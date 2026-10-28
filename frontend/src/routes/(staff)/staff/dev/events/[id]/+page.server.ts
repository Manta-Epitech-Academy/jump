import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { EVENT_CATEGORY_TAG_SELECT } from '$lib/server/services/eventCategories';
import { loadInscritsCohort } from '$lib/server/services/inscritsCohort';
import { loadClosingsRoster } from '$lib/server/services/closingsRoster';
import { loadFeedbackRoster } from '$lib/server/services/feedbackRoster';
import {
  planEventWorkbook,
  workbookSections,
} from '$lib/server/services/eventSheets';
import { resolveEventDiplomaIdentity } from '$lib/server/diplomaTemplates';
import { recoQuestionOf } from '$lib/server/feedbackStats';
import { composeEventStartInstant } from '$lib/server/eventTime';
import { reachableSurfaces } from '$lib/domain/eventModules';
import { eventDisplayName, effectiveStartMinutes } from '$lib/domain/event';
import {
  applyPhaseOverride,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { daysLabelLong, eventDayKeys } from '$lib/domain/campusCalendar';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { eventHomeFigures, type EventHomeFigures } from '$lib/domain/eventHome';

// The event's home (#443): where it opens, with its figures and its actions.
//
// The shell (header, actions) is awaited, being a handful of cheap reads; the
// nine cards stream behind it, since they read the three rosters the event's
// pages list. The load reads nothing off the address.
export const load: PageServerLoad = async ({ params, locals, parent }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId, 'home');

  // The workspace's own entry for the event: the sidebar reads its gates from
  // it, so the cards link to exactly the pages the menu offers. An event that
  // is not a member of the workspace (not activated for the dev space) has no
  // home here, rather than one under another event's name in the menu.
  const { workspace } = await parent();
  const entry = workspace.events.find((e) => e.id === event.id);
  if (!entry) throw error(404, 'Événement introuvable.');

  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  const [row, workbook, diploma, rosterSize] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { category: { select: EVENT_CATEGORY_TAG_SELECT } },
    }),
    // Which sections the whole export carries, and the form and grid the
    // cards read: the same gates as each section's own page.
    planEventWorkbook(event),
    resolveEventDiplomaIdentity(event),
    db.participation.count({
      where: { eventId: event.id, ...visibleParticipationWhere },
    }),
  ]);

  const now = new Date();
  const { first, last } = eventDayKeys(event.date, event.endDate, timezone);

  const figures: Promise<EventHomeFigures> = (async () => {
    const reco = workbook.feedbackForm
      ? recoQuestionOf(workbook.feedbackForm)
      : null;
    const [cohort, closings, feedback] = await Promise.all([
      loadInscritsCohort(db, event, timezone),
      workbook.closings ? loadClosingsRoster(db, event.id) : null,
      workbook.feedbackForm
        ? loadFeedbackRoster(db, event.id, workbook.feedbackForm.id, reco)
        : null,
    ]);
    return eventHomeFigures({
      rows: cohort.rows,
      closings,
      feedback: feedback && {
        ...feedback,
        recoOptions:
          reco?.options.map((o) => ({ id: o.id, label: o.label })) ?? null,
      },
    });
  })();

  return {
    event: {
      id: event.id,
      name: eventDisplayName(event),
      category: row.category,
      daysLabel: daysLabelLong(first, last),
      externalId: event.externalId,
    },
    countdown: {
      status: applyPhaseOverride(
        getEventStatus(event, getLifecycleBounds(timezone, now)),
        locals.stagePhaseOverride,
      ),
      openDate: composeEventStartInstant(
        event.date,
        effectiveStartMinutes(event.startMinutes),
        timezone,
      ),
    },
    reachable: reachableSurfaces(entry),
    rosterSize,
    // Which certificate the event issues, or null when it issues none, which
    // hides its action. The identity only: the label names the download.
    diploma,
    exportSections: workbookSections(workbook),
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    figures,
  };
};
