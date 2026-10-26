import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadCampusCalendar } from '$lib/server/services/campusCalendar';
import { isSchoolYearLabel, schoolYearOf } from '$lib/domain/schoolYear';

/**
 * The dev space opens on its campus's calendar: every event of a school year,
 * the days without school greyed. The year is the page's address
 * (`?year=2026-2027`), the school year in progress when there is none, because
 * it is what this page is about, as an event is what an event page is about.
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
  const schoolYear = asked ?? schoolYearOf(new Date(), timezone).label;

  return {
    calendar: await loadCampusCalendar(scopedPrisma(getCampusId(locals)), {
      timezone,
      departement: locals.staffProfile?.campus?.departement ?? null,
      schoolYear,
    }),
  };
};
