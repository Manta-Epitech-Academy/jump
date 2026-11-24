import type { LayoutServerLoad } from './$types';
import { prisma } from '#lib/server/db.ts';
import { shownEnrolmentWhere } from '#lib/domain/eventReadiness.ts';
import { dbDateToKey } from '#lib/domain/eventPresence.ts';
import { toDateKey } from '#lib/domain/planningTime.ts';
import { arrivalCues } from '#lib/domain/mascot.ts';
import {
  loadEventDays,
  loadMascotVoice,
} from '#lib/server/services/mascotService.ts';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Planning is data-driven (no campus flag): the talent has a calendar iff at
  // least one of their events carries a real schedule (≥1 non-orga time slot),
  // among the enrolments the dev space shows on events an admin activated, as
  // the home's hero and the calendar itself.
  // Guards /calendar, which the hero's « Voir le planning » leads to.
  let hasPlannedEvents = false;
  if (locals.talent) {
    const planned = await prisma.participation.findFirst({
      where: {
        talentId: locals.talent.id,
        ...shownEnrolmentWhere({
          planningSlots: { some: { activityType: { not: 'orga' } } },
        }),
      },
      select: { id: true },
    });
    hasPlannedEvents = planned != null;
  }

  return {
    hasPlannedEvents,
    mascot: locals.talent ? await mascotFor(locals.talent, locals) : null,
  };
};

/**
 * What the header's EpiDuck needs beyond the talent's own row (#539): what he
 * may say today, and what he says on arrival (#540): a hello, a welcome back
 * when the previous visit is weeks old, or the day's milestone of the run of
 * days, read off the visit days the streak keeps, then an event today or
 * tomorrow.
 */
async function mascotFor(
  talent: NonNullable<App.Locals['talent']>,
  locals: App.Locals,
) {
  const now = new Date();
  const today = toDateKey(now, locals.talentTimezone ?? 'Europe/Paris');
  const dayOf = (day: Date | null) => (day ? dbDateToKey(day) : null);
  const [voice, events] = await Promise.all([
    loadMascotVoice(today),
    loadEventDays(talent.id, now),
  ]);
  return {
    voice,
    arrival: arrivalCues({
      visits: {
        lastDay: dayOf(talent.streakLastDay),
        previousDay: dayOf(talent.streakPreviousDay),
      },
      streakDays: talent.streakDays,
      today,
      events,
    }),
    today,
  };
}
