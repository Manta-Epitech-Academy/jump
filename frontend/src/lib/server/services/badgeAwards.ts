// ─── Awarding badges (#448) ────────────────────────────────────────────────
//
// A talent earns a badge the moment one of their counters reaches its rule's
// threshold, and keeps it: the award is a fact (`Badge_Award`), never a
// projection taken back when the counter goes down. One function decides who
// earns what, `awardDueBadges`, and three things call it:
//
//   - `write_badge`, for the badge it creates or unarchives, over every talent:
//     those who already meet its rule get it that day;
//   - the talent's own acts, in the act's transaction and for the counters the
//     act moves (a game finished, an activity's step, a questionnaire sent, the
//     day's first visit, the onboarding signed), so a badge arrives with what
//     earned it;
//   - the sweep (`POST /api/jobs/award-badges`), for what no act of the talent
//     writes: an event ending, a status Salesforce sends, an émargement or a
//     closing the staff writes, an admin's configuration, a reward granted
//     from a file.
//
// Every counter reads the rule the rest of Jump reads it with, imported, never
// restated. Set-wise: one grouped query per badge, whatever the number of
// talents, so the sweep costs the number of live badges.
//
// Takes the transaction it runs in and imports nothing from SvelteKit, like
// `xpService`: the caller owns the transaction, and the seed awards its
// generated world through the same function.

import type { Prisma } from '@prisma/client';
import { attendedShownBeforeWhere } from '../../domain/attendance';
import {
  type BadgeCounterKey,
  type BadgeRule,
  isBadgeCounterKey,
} from '../../domain/badges';
import { shownEnrolmentWhere } from '../../domain/eventReadiness';
import { dateKeyToDbDate, dbDateToKey } from '../../domain/eventPresence';
import { fromWallClock } from '../../domain/planningTime';
import { finishedActivityWhere } from '../../domain/workshops';

type Tx = Prisma.TransactionClient;

/** What a badge row carries of its rule, for {@link badgeRuleOf}. */
export const BADGE_RULE_SELECT = {
  key: true,
  counterKey: true,
  threshold: true,
  periodFrom: true,
  periodTo: true,
  events: { select: { eventId: true } },
  categories: { select: { categoryKey: true } },
  domains: { select: { domainKey: true } },
} satisfies Prisma.Badge_DefinitionSelect;

type BadgeRuleRow = Prisma.Badge_DefinitionGetPayload<{
  select: typeof BADGE_RULE_SELECT;
}>;

/** A stored badge's rule, in the shape the domain reads. */
export function badgeRuleOf(row: Omit<BadgeRuleRow, 'key'>): BadgeRule {
  return {
    counterKey: row.counterKey,
    threshold: row.threshold,
    eventIds: row.events.map((e) => e.eventId),
    categoryKeys: row.categories.map((c) => c.categoryKey),
    domainKeys: row.domains.map((d) => d.domainKey),
    periodFrom: row.periodFrom ? dbDateToKey(row.periodFrom) : null,
    periodTo: row.periodTo ? dbDateToKey(row.periodTo) : null,
  };
}

/**
 * The events a period keeps: those whose first day falls in it, read in the
 * event's own campus, since `Event.date` is that campus's midnight. One bound
 * pair per campus rather than a cast in SQL, so the rule stays a Prisma where
 * the enrolment and attendance rules can be ANDed with.
 */
async function periodWhere(
  tx: Tx,
  from: string | null,
  to: string | null,
): Promise<Prisma.EventWhereInput> {
  const campuses = await tx.campus.findMany({
    select: { id: true, timezone: true },
  });
  const dayAfter = (key: string) => {
    const next = dateKeyToDbDate(key);
    next.setUTCDate(next.getUTCDate() + 1);
    return dbDateToKey(next);
  };
  return {
    OR: campuses.map((campus) => ({
      campusId: campus.id,
      date: {
        ...(from ? { gte: fromWallClock(from, '00:00', campus.timezone) } : {}),
        ...(to
          ? { lt: fromWallClock(dayAfter(to), '00:00', campus.timezone) }
          : {}),
      },
    })),
  };
}

/** The events a rule on enrolments or visits keeps, or null for all of them. */
async function eventFilterOf(
  tx: Tx,
  rule: BadgeRule,
): Promise<Prisma.EventWhereInput | null> {
  const parts: Prisma.EventWhereInput[] = [];
  if (rule.eventIds.length > 0) parts.push({ id: { in: [...rule.eventIds] } });
  if (rule.categoryKeys.length > 0) {
    parts.push({ categoryKey: { in: [...rule.categoryKeys] } });
  }
  if (rule.periodFrom !== null || rule.periodTo !== null) {
    parts.push(await periodWhere(tx, rule.periodFrom, rule.periodTo));
  }
  return parts.length > 0 ? { AND: parts } : null;
}

/** Whom to count: every talent still with us, or only some of them. */
function talentScope(
  talentIds: readonly string[] | undefined,
): Prisma.TalentWhereInput {
  return {
    anonymizedAt: null,
    ...(talentIds ? { id: { in: [...talentIds] } } : {}),
  };
}

/**
 * The talents who meet `rule` at `now`, among `talentIds` when given. An
 * erased talent never qualifies.
 */
export async function badgeHolders(
  tx: Tx,
  rule: BadgeRule,
  options: { now: Date; talentIds?: readonly string[] },
): Promise<string[]> {
  if (!isBadgeCounterKey(rule.counterKey)) {
    // A key the catalogue no longer holds (a counter retired in code) counts
    // nobody: what was earned on it stays earned.
    return [];
  }
  const talent = talentScope(options.talentIds);
  const atLeast = { _count: { gte: rule.threshold } };
  const ids = (rows: { talentId: string | null }[]) =>
    rows.flatMap((row) => (row.talentId ? [row.talentId] : []));

  switch (rule.counterKey satisfies BadgeCounterKey) {
    case 'xp': {
      const rows = await tx.talent.findMany({
        where: { ...talent, xp: { gte: rule.threshold } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }
    case 'signInStreak': {
      const rows = await tx.talent.findMany({
        where: { ...talent, streakDays: { gte: rule.threshold } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }
    case 'enrolments': {
      const event = await eventFilterOf(tx, rule);
      const rows = await tx.participation.groupBy({
        by: ['talentId'],
        where: { AND: [shownEnrolmentWhere(event ?? undefined), { talent }] },
        having: { talentId: atLeast },
      });
      return ids(rows);
    }
    case 'attended': {
      const event = await eventFilterOf(tx, rule);
      const rows = await tx.participation.groupBy({
        by: ['talentId'],
        where: {
          AND: [
            attendedShownBeforeWhere(options.now),
            ...(event ? [{ event }] : []),
            { talent },
          ],
        },
        having: { talentId: atLeast },
      });
      return ids(rows);
    }
    case 'finishedActivities': {
      const rows = await tx.workshop_Participation.groupBy({
        by: ['talentId'],
        where: {
          AND: [
            finishedActivityWhere(tx.workshop_Participation.fields.totalSteps),
            { talent },
            ...(rule.domainKeys.length > 0
              ? [
                  {
                    activity: {
                      domains: {
                        some: { domainKey: { in: [...rule.domainKeys] } },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        having: { talentId: atLeast },
      });
      return ids(rows);
    }
    case 'dailyFirstPlaces': {
      const rows = await tx.minigameAttempt.groupBy({
        by: ['talentId'],
        where: { status: 'done', rankAtFinish: 1, talent },
        having: { talentId: atLeast },
      });
      return ids(rows);
    }
    case 'questionnaires': {
      const rows = await tx.feedback_Submission.groupBy({
        by: ['talentId'],
        where: { source: 'authenticated', talent },
        having: { talentId: atLeast },
      });
      return ids(rows);
    }
  }
}

/**
 * The talents who would earn a badge now and do not hold it yet: what
 * `write_badge` shows before it creates or unarchives one, and what the apply
 * then awards. `badgeKey` is null for a badge not written yet.
 */
export async function newBadgeHolders(
  tx: Tx,
  badgeKey: string | null,
  rule: BadgeRule,
  now: Date,
): Promise<string[]> {
  const holders = await badgeHolders(tx, rule, { now });
  if (badgeKey === null || holders.length === 0) return holders;
  const held = await tx.badge_Award.findMany({
    where: { badgeKey, talentId: { in: holders } },
    select: { talentId: true },
  });
  const already = new Set(held.map((row) => row.talentId));
  return holders.filter((id) => !already.has(id));
}

/**
 * Award every live badge its due: each talent who meets its rule at `now` and
 * does not hold it gets it, dated `now`. Narrowed to some badges (a badge just
 * written), some talents (the one who just acted) or some counters (the ones
 * that act moved). Never takes an award back, and an archived badge is earned
 * by nobody. Idempotent, and safe against a concurrent pass: a pair already
 * awarded is skipped by its key.
 *
 * Returns how many awards it wrote.
 */
export async function awardDueBadges(
  tx: Tx,
  options: {
    now: Date;
    badgeKeys?: readonly string[];
    talentIds?: readonly string[];
    counters?: readonly BadgeCounterKey[];
  },
): Promise<number> {
  if (options.talentIds?.length === 0) return 0;
  const badges = await tx.badge_Definition.findMany({
    where: {
      archivedAt: null,
      ...(options.badgeKeys ? { key: { in: [...options.badgeKeys] } } : {}),
      ...(options.counters
        ? { counterKey: { in: [...options.counters] } }
        : {}),
    },
    select: BADGE_RULE_SELECT,
    orderBy: { key: 'asc' },
  });
  let awarded = 0;
  for (const badge of badges) {
    const holders = await badgeHolders(tx, badgeRuleOf(badge), {
      now: options.now,
      talentIds: options.talentIds,
    });
    if (holders.length === 0) continue;
    const { count } = await tx.badge_Award.createMany({
      data: holders.map((talentId) => ({
        talentId,
        badgeKey: badge.key,
        awardedAt: options.now,
      })),
      skipDuplicates: true,
    });
    awarded += count;
  }
  return awarded;
}
