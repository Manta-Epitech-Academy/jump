import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { listAttendedEvents } from '$lib/server/talent/attendedEvents';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // Resolve the talent's own zone (`tz` cookie, Europe/Paris fallback) and hand
  // it to the page so SSR and the browser group the timeline by the same month.
  const timeZone = getBrowserTimezone(cookies);
  const pastEvents = await listAttendedEvents(locals.talent.id, { timeZone });

  return { pastEvents, timeZone };
};
