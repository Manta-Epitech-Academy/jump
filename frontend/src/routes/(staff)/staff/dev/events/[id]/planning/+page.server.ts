import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ locals, params }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const event = await loadEventOr404(params.id, campusId);

  // Planning is data-driven (not a module): the read-only dev view exists only
  // when the event actually has a schedule. An event with no slots has nothing
  // to show, so it 404s rather than presenting an empty grid.
  //
  // One query and one emptiness check. It used to be a `findUniqueOrThrow` on a
  // wrapper row plus a P2025-to-404 branch, because an event carried a Planning
  // whether or not it held anything - 286 of 292 of them held nothing. There is
  // no wrapper any more, so "no planning row" and "no slots" are the same state
  // and read as one.
  const slots = await db.planning_Slot.findMany({
    where: { eventId: params.id },
    orderBy: { startTime: 'asc' },
  });
  if (slots.length === 0) {
    throw error(404, 'Aucun planning pour cet événement.');
  }

  return {
    event,
    slots,
    timezone: getCampusTimezone(locals),
    // Seed for the now-line so SSR and first client render agree.
    serverNow: Date.now(),
  };
};
