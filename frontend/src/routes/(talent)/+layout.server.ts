import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Planning is data-driven (no campus flag): the talent has a calendar iff at
  // least one of their events carries a real schedule (≥1 non-orga time slot),
  // among the enrolments the dev space shows, as the home's session card.
  // Drives the "Voir le planning" CTA, the /calendar guard and the nav links.
  let hasPlannedEvents = false;
  if (locals.talent) {
    const planned = await prisma.participation.findFirst({
      where: {
        talentId: locals.talent.id,
        ...visibleParticipationWhere,
        event: {
          planningSlots: { some: { activityType: { not: 'orga' } } },
        },
      },
      select: { id: true },
    });
    hasPlannedEvents = planned != null;
  }

  return {
    hasPlannedEvents,
  };
};
