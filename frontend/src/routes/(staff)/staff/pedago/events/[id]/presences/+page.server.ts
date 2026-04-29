import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import {
  findPrimarySlot,
  getEventOrgaSlotsWithCounts,
  groupSlotsByDay,
  type OrgaSlotWithCounts,
} from '$lib/domain/presences';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  const now = new Date();
  const slots = await getEventOrgaSlotsWithCounts(event.id, db, now);
  const allByDay = groupSlotsByDay<OrgaSlotWithCounts>(slots, timezone);
  const activeDays = allByDay.filter((g) =>
    g.slots.some((s) => s.status !== 'past'),
  );
  const pastDays = allByDay
    .filter((g) => g.slots.every((s) => s.status === 'past'))
    .reverse();
  const primarySlot = findPrimarySlot(slots, now);
  const totalParticipants = slots[0]?.totalCount ?? 0;

  const totals = {
    totalSlots: slots.length,
    completedSlots: slots.filter((s) => s.status === 'past').length,
    liveSlots: slots.filter((s) => s.status === 'live').length,
    upcomingSlots: slots.filter((s) => s.status === 'upcoming').length,
    totalParticipants,
  };

  return {
    event,
    activeDays,
    pastDays,
    primarySlot,
    totals,
    timezone,
  };
};
