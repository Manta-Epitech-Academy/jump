import { prisma } from '$lib/server/db';
import { xpHistoryLabel, type XpStory } from '$lib/domain/xpStory';
import { workshopSlugFromSourceId } from '$lib/domain/workshops';

/** Short French "16 juin" label in the campus timezone, for the history feed. */
function dateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Resolves the name of the thing each grant names, as a `sourceId -> label` map.
 * Grants whose source names nothing are simply absent.
 *
 * Two sources carry an identity that does not live on the grant, and both encode
 * it in the `sourceId`, so both are parsed HERE and nowhere else: a `reward` is
 * `${rewardId}_${talentId}` (written by `grant-reward-from-csv`), a `workshop` is
 * `${instanceSlug}:${talentId}`. Shared by both readers, the dev fiche XP story
 * and the talent `/xp` timeline, so the contract stays parsed in one place.
 */
export async function resolveGrantLabels(
  talentId: string,
  grants: { source: string; sourceId: string | null }[],
): Promise<Map<string, string>> {
  const rewardIdOf = (sourceId: string): string =>
    sourceId.endsWith(`_${talentId}`)
      ? sourceId.slice(0, -(talentId.length + 1))
      : sourceId;

  // sourceId -> rewardId, for the reward grants we actually have.
  const rewardIdBySourceId = new Map<string, string>();
  // sourceId -> instance slug, for the workshop grants.
  const slugBySourceId = new Map<string, string>();
  for (const g of grants) {
    if (!g.sourceId) continue;
    if (g.source === 'reward') {
      rewardIdBySourceId.set(g.sourceId, rewardIdOf(g.sourceId));
    } else if (g.source === 'workshop') {
      const slug = workshopSlugFromSourceId(g.sourceId);
      if (slug) slugBySourceId.set(g.sourceId, slug);
    }
  }
  if (rewardIdBySourceId.size === 0 && slugBySourceId.size === 0) {
    return new Map();
  }

  const [rewards, instances] = await Promise.all([
    rewardIdBySourceId.size > 0
      ? prisma.xpReward.findMany({
          where: { id: { in: [...new Set(rewardIdBySourceId.values())] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    slugBySourceId.size > 0
      ? prisma.workshop_Instance.findMany({
          where: { slug: { in: [...new Set(slugBySourceId.values())] } },
          select: { slug: true, label: true },
        })
      : Promise.resolve([]),
  ]);
  const nameByRewardId = new Map(rewards.map((r) => [r.id, r.name]));
  const labelBySlug = new Map(instances.map((i) => [i.slug, i.label]));

  const labelBySourceId = new Map<string, string>();
  for (const [sourceId, rewardId] of rewardIdBySourceId) {
    const name = nameByRewardId.get(rewardId);
    if (name) labelBySourceId.set(sourceId, name);
  }
  for (const [sourceId, slug] of slugBySourceId) {
    const label = labelBySlug.get(slug);
    if (label) labelBySourceId.set(sourceId, label);
  }
  return labelBySourceId;
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

  const grantLabels = await resolveGrantLabels(talentId, grants);
  const labelFor = (sourceId: string | null): string | undefined =>
    sourceId ? grantLabels.get(sourceId) : undefined;

  return {
    total: grants.reduce((sum, g) => sum + g.amount, 0),
    history: [...grants]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((g) => ({
        id: g.id,
        source: g.source,
        label: xpHistoryLabel(
          g.source,
          g.amount,
          labelFor(g.sourceId),
          'staff',
        ),
        amount: g.amount,
        dateLabel: dateLabel(g.createdAt, timeZone),
      })),
  };
}
