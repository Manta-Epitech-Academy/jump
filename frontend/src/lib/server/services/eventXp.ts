import { prisma } from '$lib/server/db';

/**
 * The XP earned at one event, per talent, and whether the event offers the
 * activities that are the one way to earn any there: what the event home's
 * « Top acquisition XP » card ranks (#491).
 *
 * Earned at the event means a grant attributed to it (`XpGrant.eventId`), which
 * only an activity walked there carries. The plain client, with the event id as
 * the whole filter: the caller has already resolved the event on its campus.
 */
export async function loadEventXp(eventId: string): Promise<{
  byTalent: Map<string, number>;
  hasActivities: boolean;
}> {
  const [grants, activities] = await Promise.all([
    prisma.xpGrant.groupBy({
      by: ['talentId'],
      where: { eventId },
      _sum: { amount: true },
    }),
    prisma.eventConfig_Workshop.count({ where: { eventId } }),
  ]);
  return {
    byTalent: new Map(grants.map((g) => [g.talentId, g._sum.amount ?? 0])),
    hasActivities: activities > 0,
  };
}
