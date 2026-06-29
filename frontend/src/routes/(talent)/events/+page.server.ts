import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { EVENT_TYPES } from '$lib/domain/event';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // "Past" and the month grouping both depend on a timezone. Resolve the
  // talent's own (`tz` cookie, Europe/Paris fallback) and compute the end of
  // today against it, then hand the zone to the page so SSR and the browser
  // group by the same month: an ambient `new Date()` would bucket a
  // near-midnight event onto a different month on a UTC pod than in the
  // browser, hydrating with a flash.
  const timeZone = getBrowserTimezone(cookies);
  const filterDateEnd = now(timeZone)
    .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    .toDate();

  const pastEvents = await prisma.participation.findMany({
    where: {
      talentId: locals.talent.id,
      isPresent: true,
      event: {
        eventType: EVENT_TYPES.CODING_CLUB,
        date: { lte: filterDateEnd },
      },
    },
    select: {
      id: true,
      event: { select: { titre: true, date: true } },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return { pastEvents, timeZone };
};
