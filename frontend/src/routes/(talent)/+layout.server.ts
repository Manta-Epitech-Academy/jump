import type { LayoutServerLoad } from './$types';
import { prisma } from '#lib/server/db.ts';
import { shownEnrolmentWhere } from '#lib/domain/eventReadiness.ts';
import { dbDateToKey } from '#lib/domain/eventPresence.ts';
import { toDateKey } from '#lib/domain/planningTime.ts';
import { greetingFor } from '#lib/domain/mascot.ts';
import { loadMascotVoice } from '#lib/server/services/mascotService.ts';

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
 * may say today, and how he greets the talent: a hello, or a welcome back when
 * the previous visit is weeks old. `streakLastDay` is still the previous
 * visit's day here, since the streak write does not touch the loaded row, so
 * the greeting is read off it before anything moves it.
 */
async function mascotFor(
  talent: NonNullable<App.Locals['talent']>,
  locals: App.Locals,
) {
  const today = toDateKey(new Date(), locals.talentTimezone ?? 'Europe/Paris');
  return {
    voice: await loadMascotVoice(today),
    greeting: greetingFor(
      talent.streakLastDay ? dbDateToKey(talent.streakLastDay) : null,
      today,
    ),
    today,
  };
}
