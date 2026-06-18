import { prisma } from '$lib/server/db';
import { xpHistoryLabel, type XpStory } from '$lib/domain/xpStory';

/** Short French "16 juin" label in the campus timezone, for the history feed. */
function dateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Read-side builder for a talent's XP story (the dev fiche medallion + history
 * dialog): the projection total plus a newest-first, humanised feed of every
 * grant. The XpGrant ledger already holds every fact, so this is a single query
 * plus humanisation - no joins. Single-talent, low-hundreds of rows at most, so it
 * awaits cheaply in `load` (not a cohort).
 *
 * Mirrors the write-side split: grants are *written* by `xpService`, *read* here.
 */
export async function getTalentXpStory(
  talentId: string,
  timeZone: string,
): Promise<XpStory> {
  const grants = await prisma.xpGrant.findMany({
    where: { talentId },
    select: {
      id: true,
      source: true,
      amount: true,
      sourceId: true,
      createdAt: true,
    },
  });

  // A `reward` grant's identity lives on its XpReward (the activity name), not on
  // the grant. The grant's sourceId is `${rewardId}_${talentId}`, so strip the
  // known talentId suffix to recover the rewardId and resolve every name in one
  // query, then humanise. Non-reward grants need no lookup.
  const rewardIdOf = (sourceId: string): string =>
    sourceId.endsWith(`_${talentId}`)
      ? sourceId.slice(0, -(talentId.length + 1))
      : sourceId;

  const rewardIds = grants
    .filter((g) => g.source === 'reward' && g.sourceId)
    .map((g) => rewardIdOf(g.sourceId!));
  const rewardNames = new Map<string, string>();
  if (rewardIds.length) {
    const rewards = await prisma.xpReward.findMany({
      where: { id: { in: rewardIds } },
      select: { id: true, name: true },
    });
    for (const r of rewards) rewardNames.set(r.id, r.name);
  }

  const rewardNameFor = (sourceId: string | null): string | undefined =>
    sourceId ? rewardNames.get(rewardIdOf(sourceId)) : undefined;

  return {
    total: grants.reduce((sum, g) => sum + g.amount, 0),
    history: [...grants]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((g) => ({
        id: g.id,
        source: g.source,
        label: xpHistoryLabel(g.source, g.amount, rewardNameFor(g.sourceId)),
        amount: g.amount,
        dateLabel: dateLabel(g.createdAt, timeZone),
      })),
  };
}
