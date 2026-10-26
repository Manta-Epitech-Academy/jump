import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import {
  buildCampusCalendar,
  type CampusCalendar,
} from '$lib/domain/campusCalendar';
import { eventDisplayName, eventStartInstant } from '$lib/domain/event';
import { getEventStatus, getLifecycleBounds } from '$lib/domain/eventLifecycle';
import { toDateKey } from '$lib/domain/planningTime';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { devVisibleEventWhere } from './stageContext';
import { EVENT_CATEGORY_SELECT, eventCategoryView } from './eventCategories';

/**
 * A campus's school year, as the dev space's landing page shows it.
 *
 * The events are the dev space's own (`devVisibleEventWhere`): a click opens
 * one, so the calendar holds no event it could not open. Their window is the
 * grid's twelve months plus 31 July, the day the school year turns on, so the
 * grid can paint a neighbouring year's event and the list holds every event of
 * the year. The count beside each is the enrolments the dev space shows.
 */
export async function loadCampusCalendar(
  db: ScopedPrismaClient,
  input: {
    timezone: string;
    departement: string | null;
    schoolYear: string;
    now?: Date;
  },
): Promise<CampusCalendar> {
  const { timezone, departement, schoolYear, now = new Date() } = input;
  const startYear = Number(schoolYear.slice(0, 4));
  const from = eventStartInstant(`${startYear}-07-31`, timezone);
  const to = eventStartInstant(`${startYear + 1}-08-01`, timezone);

  const rows = await db.event.findMany({
    where: {
      ...devVisibleEventWhere,
      date: { lt: to },
      OR: [{ endDate: null, date: { gte: from } }, { endDate: { gte: from } }],
    },
    select: {
      id: true,
      titre: true,
      publicName: true,
      date: true,
      endDate: true,
      category: { select: EVENT_CATEGORY_SELECT },
      _count: {
        select: { participations: { where: visibleParticipationWhere } },
      },
    },
  });

  const bounds = getLifecycleBounds(timezone, now);
  return buildCampusCalendar({
    schoolYear,
    today: toDateKey(now, timezone),
    departement,
    events: rows.map((e) => {
      const first = toDateKey(e.date, timezone);
      const last = toDateKey(e.endDate ?? e.date, timezone);
      return {
        id: e.id,
        name: eventDisplayName(e),
        first,
        // A Salesforce end before the start would paint nothing: one day.
        last: last < first ? first : last,
        schoolYear: schoolYearOf(e.date, timezone).label,
        category: e.category && eventCategoryView(e.category),
        status: getEventStatus(e, bounds),
        shownEnrolments: e._count.participations,
      };
    }),
  });
}
