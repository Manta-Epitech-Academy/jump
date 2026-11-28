import { prisma } from '#lib/server/db.ts';
import type { DateKey } from '#lib/domain/planningTime.ts';
import {
  badgeEarnedMonth,
  badgeGroupRank,
  type BadgeCollection,
  type CollectedBadge,
} from '#lib/domain/badges.ts';
import { liveMascotLineWhere } from '#lib/server/services/mascotService.ts';

/**
 * A talent's Epidex on Mon parcours (#551): every live badge, earned or still
 * to earn, and the archived ones this talent earned, which stay theirs with
 * their day (an archived badge nobody gave them is gone from their
 * collection: nobody can earn it any more). In the collection's order, by
 * group, then in the order the PO created them.
 *
 * Each badge comes with the duck's lines for the state it is in for this
 * talent (`badgeEarned` or `badgeToEarn`), live on `today`, so a click is
 * answered without a request: the header's voice never carries them
 * (`loadMascotVoice`), since only this page says them.
 *
 * Empty for a Jump where the PO has written no badge yet, which the page
 * shows as nothing at all rather than « 0 / 0 ».
 */
export async function loadBadgeCollection(
  talentId: string,
  today: DateKey,
  timeZone: string,
): Promise<BadgeCollection> {
  const rows = await prisma.badge_Definition.findMany({
    where: {
      OR: [{ archivedAt: null }, { awards: { some: { talentId } } }],
    },
    orderBy: [{ createdAt: 'asc' }, { key: 'asc' }],
    select: {
      key: true,
      label: true,
      condition: true,
      groupKey: true,
      art: true,
      awards: { where: { talentId }, select: { awardedAt: true } },
      lines: {
        where: liveMascotLineWhere(today),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { momentKey: true, text: true },
      },
    },
  });

  const badges = rows
    .sort((a, b) => badgeGroupRank(a.groupKey) - badgeGroupRank(b.groupKey))
    .map((row): CollectedBadge => {
      const award = row.awards[0];
      const moment = award ? 'badgeEarned' : 'badgeToEarn';
      return {
        key: row.key,
        label: row.label,
        condition: row.condition,
        art: row.art,
        earnedOn: award ? badgeEarnedMonth(award.awardedAt, timeZone) : null,
        lines: row.lines
          .filter((line) => line.momentKey === moment)
          .map((line) => line.text),
      };
    });
  return {
    badges,
    earned: badges.filter((badge) => badge.earnedOn !== null).length,
  };
}
