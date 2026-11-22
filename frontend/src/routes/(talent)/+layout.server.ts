import type { LayoutServerLoad } from './$types';
import { prisma } from '#lib/server/db.ts';
import { shownEnrolmentWhere } from '#lib/domain/eventReadiness.ts';

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
  };
};
