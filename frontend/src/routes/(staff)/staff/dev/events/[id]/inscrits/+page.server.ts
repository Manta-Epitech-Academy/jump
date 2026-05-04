import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { compareNiveaux } from './components/niveau';

export const load: PageServerLoad = async ({ params, locals }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  const db = scopedPrisma(campusId);

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const talentIds = participations.map((p) => p.talentId);
  const lastEvents = talentIds.length
    ? await db.participation.findMany({
        where: {
          talentId: { in: talentIds },
          event: { date: { lt: event.date } },
        },
        orderBy: [{ talentId: 'asc' }, { event: { date: 'desc' } }],
        distinct: ['talentId'],
        select: {
          talentId: true,
          event: { select: { titre: true, date: true } },
        },
      })
    : [];
  const lastByTalent = new Map(lastEvents.map((r) => [r.talentId, r.event]));

  const rows = participations.map((p) => ({
    participation: p,
    lastEvent: lastByTalent.get(p.talentId) ?? null,
  }));

  const availableNiveaux = Array.from(
    new Set(
      participations
        .map((p) => p.talent?.niveau)
        .filter((n): n is string => !!n),
    ),
  ).sort(compareNiveaux);

  return {
    event,
    rows,
    availableNiveaux,
    timezone: getCampusTimezone(locals),
  };
};

export const actions: Actions = {
  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals), params.id);
  },

  remove: async ({ url, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findFirstOrThrow({
        where: { id, eventId: params.id },
        include: { activities: { include: { activity: true } } },
      });

      if (p.isPresent) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));
        const profile = await prisma.talent.findUniqueOrThrow({
          where: { id: p.talentId },
          select: { xp: true, eventsCount: true },
        });
        await prisma.talent.update({
          where: { id: p.talentId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      await prisma.participation.delete({ where: { id } });
      return { success: true };
    } catch {
      return fail(500);
    }
  },
};
