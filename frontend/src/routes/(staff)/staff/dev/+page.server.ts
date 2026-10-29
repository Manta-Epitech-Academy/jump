import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadCampusCalendar } from '$lib/server/services/campusCalendar';
import { calendarYearOf } from '$lib/domain/campusCalendar';
import { campusClock, toDateKey } from '$lib/domain/planningTime';
import { isSchoolYearLabel } from '$lib/domain/schoolYear';
import { firstNameOf } from '$lib/domain/profile';
import { greetingFor } from '$lib/domain/devVoice';

/**
 * The dev space opens on its campus's calendar: every event of a school year,
 * the days without school greyed. The year is the page's address
 * (`?year=2026-2027`), the one whose grid holds today when there is none,
 * because it is what this page is about, as an event is what an event page is
 * about.
 *
 * It also greets whoever opens it, by the campus clock rather than the
 * server's or the browser's, and computed here so the server render and the
 * page agree on it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Authentification requise');
  }

  const timezone = getCampusTimezone(locals);
  const asked = url.searchParams.get('year');
  if (asked !== null && !isSchoolYearLabel(asked)) {
    throw redirect(303, resolve('/staff/dev'));
  }
  const now = new Date();
  const today = toDateKey(now, timezone);
  const schoolYear = asked ?? calendarYearOf(today);

  const calendar = await loadCampusCalendar(scopedPrisma(getCampusId(locals)), {
    timezone,
    departement: locals.staffProfile?.campus?.departement ?? null,
    schoolYear,
  });
  const { hour, weekday } = campusClock(now, timezone);

  return {
    calendar,
    greeting: greetingFor({
      hour,
      weekday,
      firstName: firstNameOf(locals.user.name),
      // Only the year on screen is loaded: jour J is seen from the year the
      // page opens on, the one holding today.
      startsToday: Object.values(calendar.events).some(
        (e) => e.first === today,
      ),
    }),
  };
};
