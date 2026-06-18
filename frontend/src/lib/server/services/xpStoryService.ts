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
 * Resolves the `XpReward.name` behind a talent's `reward` grants, returning a
 * `sourceId -> name` map (reward grants only; everything else is absent).
 *
 * A reward grant's identity (the activity name, e.g. "OSINT CTFD Stage Seconde")
 * lives on its `XpReward`, not on the grant. The grant's `sourceId` is
 * `${rewardId}_${talentId}` (written by `grant-reward-from-csv`), so strip the
 * known talentId suffix to recover each rewardId and resolve every name in one
 * query. Shared by both readers (the dev fiche XP story and the talent `/xp`
 * timeline) so the sourceId contract stays parsed in exactly one place.
 */
export async function resolveRewardNames(
  talentId: string,
  grants: { source: string; sourceId: string | null }[],
): Promise<Map<string, string>> {
  const rewardIdOf = (sourceId: string): string =>
    sourceId.endsWith(`_${talentId}`)
      ? sourceId.slice(0, -(talentId.length + 1))
      : sourceId;

  // sourceId -> rewardId, for the reward grants we actually have.
  const rewardIdBySourceId = new Map<string, string>();
  for (const g of grants) {
    if (g.source === 'reward' && g.sourceId) {
      rewardIdBySourceId.set(g.sourceId, rewardIdOf(g.sourceId));
    }
  }
  if (rewardIdBySourceId.size === 0) return new Map();

  const rewards = await prisma.xpReward.findMany({
    where: { id: { in: [...new Set(rewardIdBySourceId.values())] } },
    select: { id: true, name: true },
  });
  const nameByRewardId = new Map(rewards.map((r) => [r.id, r.name]));

  const nameBySourceId = new Map<string, string>();
  for (const [sourceId, rewardId] of rewardIdBySourceId) {
    const name = nameByRewardId.get(rewardId);
    if (name) nameBySourceId.set(sourceId, name);
  }
  return nameBySourceId;
}

/**
 * Read-side builder for a talent's XP story (the dev fiche medallion + history
 * dialog): the projection total plus a newest-first, humanised feed of every
 * grant. The XpGrant ledger already holds every fact, so this is a single query
 * plus humanisation - no joins, save the one reward-name lookup. Single-talent,
 * low-hundreds of rows at most, so it awaits cheaply in `load` (not a cohort).
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

  const rewardNames = await resolveRewardNames(talentId, grants);
  const rewardNameFor = (sourceId: string | null): string | undefined =>
    sourceId ? rewardNames.get(sourceId) : undefined;

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
