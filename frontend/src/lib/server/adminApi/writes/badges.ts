/**
 * The write on the badge catalogue (#448): create a badge, rename it, redraw
 * it, regroup it, archive or unarchive it, identified by its key.
 *
 * One write for the entity, with patch semantics: a key that does not exist yet
 * creates a badge (its label, condition, drawing and rule are then required), and
 * on an existing key only the fields given change. Except the rule: a badge's
 * counter, threshold and filters are fixed once it exists, because an award is
 * a fact that says the talent met THIS rule (`fixedBadgeRuleRefusal`). Sending
 * the rule back as it reads is accepted, so a read echoed back is a no-op.
 *
 * Two steps, class B. Creating or unarchiving a badge awards it, there and
 * then, to every talent who already meets its rule, and an award is never
 * taken back: a rule that says something other than what the admin meant would
 * stay in minors' collections for good. So the dry run says how many talents
 * would receive it before anything is written, which is what the admin checks
 * the rule against (AC1). The count is in the plan on purpose: a talent who
 * comes to meet the rule between the two calls changes the digest, so the
 * apply is refused as stale rather than award a number nobody approved. The
 * apply then awards whoever meets the rule as it commits, through
 * `awardDueBadges` like every award, not a list carried from the plan: a
 * talent who meets it in the instant between the two is a holder all the same.
 *
 * A badge nobody holds can be removed, and only that one: the shape
 * `write_campus` gives its own `remove`. `config_badges` returns every key, so
 * a delete that took a held badge would be a target a model could pick on its
 * own (class C), taking back what talents earned. Refused while any talent
 * holds it, it can only take away a badge nobody has seen on their journey,
 * which creating it again gives back, and it frees the key and the label for
 * that: the common case is a badge on an event to come, written with the wrong
 * rule, which nobody can hold yet. A held badge is archived instead: nobody
 * earns it any more, and those who did keep it.
 *
 * A badge's drawing (`art`, #551) is drawn straight into talents' pages, so it
 * is screened before anything else (`screenBadgeArt`), and stored as written or
 * not at all. To draw one before anybody receives it, it is created archived:
 * nobody is awarded an archived badge, and nobody is shown one they do not
 * hold, so its preview can be looked at and its drawing redone until it is
 * unarchived, which is when the dry run counts who would receive it.
 */

import { prisma } from '#lib/server/db.ts';
import type { Prisma } from '@prisma/client';
import {
  BADGE_COUNTERS,
  badgeRuleIssues,
  fixedBadgeRuleRefusal,
  isBadgeCounterKey,
  sameBadgeRule,
  type BadgeGroupKey,
  type BadgeRule,
} from '#lib/domain/badges.ts';
import { screenBadgeArt } from '#lib/server/badgeArtSanitize.ts';
import { badgeStickerPreviewLink } from '#lib/server/services/badgeStickerPreview.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import type { DateKey } from '#lib/domain/planningTime.ts';
import {
  awardDueBadges,
  BADGE_RULE_SELECT,
  badgeRuleOf,
  newBadgeHolders,
} from '#lib/server/services/badgeAwards.ts';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { metric } from '../metrics';
import { runTwoStep, type WriteOutcome } from '../plan';
import { archivedAtFor, refusingRaces } from './catalogue';

/** A badge in the exact shape `config_badges` returns and this write takes. */
export type BadgeState = {
  badgeKey: string;
  label: string;
  condition: string;
  group: string;
  art: string;
  counter: string;
  threshold: number;
  eventIds: string[];
  categoryKeys: string[];
  domains: string[];
  periodFrom: DateKey | null;
  periodTo: DateKey | null;
  archived: boolean;
};

export const BADGE_STATE_SELECT = {
  ...BADGE_RULE_SELECT,
  label: true,
  condition: true,
  groupKey: true,
  art: true,
  archivedAt: true,
} satisfies Prisma.Badge_DefinitionSelect;

type BadgeStateRow = Prisma.Badge_DefinitionGetPayload<{
  select: typeof BADGE_STATE_SELECT;
}>;

export function badgeState(row: BadgeStateRow): BadgeState {
  const rule = badgeRuleOf(row);
  return {
    badgeKey: row.key,
    label: row.label,
    condition: row.condition,
    group: row.groupKey,
    art: row.art,
    counter: rule.counterKey,
    threshold: rule.threshold,
    eventIds: [...rule.eventIds].sort(),
    categoryKeys: [...rule.categoryKeys].sort(),
    domains: [...rule.domainKeys].sort(),
    periodFrom: rule.periodFrom,
    periodTo: rule.periodTo,
    archived: row.archivedAt !== null,
  };
}

function ruleOfState(state: BadgeState): BadgeRule {
  return {
    counterKey: state.counter,
    threshold: state.threshold,
    eventIds: state.eventIds,
    categoryKeys: state.categoryKeys,
    domainKeys: state.domains,
    periodFrom: state.periodFrom,
    periodTo: state.periodTo,
  };
}

async function stateOf(key: string): Promise<BadgeState | null> {
  const row = await prisma.badge_Definition.findUnique({
    where: { key },
    select: BADGE_STATE_SELECT,
  });
  return row ? badgeState(row) : null;
}

export type BadgePatch = {
  badgeKey: string;
  label?: string;
  condition?: string;
  group?: BadgeGroupKey;
  art?: string;
  counter?: string;
  threshold?: number;
  eventIds?: string[];
  categoryKeys?: string[];
  domains?: string[];
  periodFrom?: DateKey | null;
  periodTo?: DateKey | null;
  archived?: boolean;
  remove?: true;
  planDigest?: string;
};

/** The fields a badge cannot be created without, by the name the call uses. */
const REQUIRED_TO_CREATE = [
  'label',
  'condition',
  'group',
  'art',
  'counter',
  'threshold',
] as const satisfies readonly (keyof BadgePatch)[];

/**
 * The badge the call leaves: the stored one with the call's fields over it, or
 * a new one built from the call alone. Refuses a creation missing a field.
 */
function stateAfter(params: BadgePatch, before: BadgeState | null): BadgeState {
  if (!before) {
    const missing = REQUIRED_TO_CREATE.filter((f) => params[f] === undefined);
    if (missing.length > 0) {
      throw new OperationRefusedError(
        `Le badge « ${params.badgeKey} » n'existe pas encore : pour le créer, donnez aussi ${missing.join(', ')}.`,
      );
    }
  }
  const pick = <K extends keyof BadgeState>(
    field: K,
    value: BadgeState[K] | undefined,
    fallback: BadgeState[K],
  ): BadgeState[K] =>
    value !== undefined ? value : (before?.[field] ?? fallback);
  const sorted = (list: string[] | undefined) =>
    list === undefined ? undefined : [...new Set(list)].sort();
  return {
    badgeKey: params.badgeKey,
    label: pick('label', params.label?.trim(), ''),
    condition: pick('condition', params.condition?.trim(), ''),
    group: pick('group', params.group, ''),
    art: pick('art', params.art, ''),
    counter: pick('counter', params.counter, ''),
    threshold: pick('threshold', params.threshold, 0),
    eventIds: pick('eventIds', sorted(params.eventIds), []),
    categoryKeys: pick('categoryKeys', sorted(params.categoryKeys), []),
    domains: pick('domains', sorted(params.domains), []),
    periodFrom: pick('periodFrom', params.periodFrom, null),
    periodTo: pick('periodTo', params.periodTo, null),
    archived: params.archived ?? before?.archived ?? false,
  };
}

/**
 * Why the rule of a new badge cannot be written, every reason at once: what the
 * rule says of itself, then the events, categories and domains it names that
 * Jump does not hold. An archived category or domain is accepted, since a rule
 * on one keeps counting (AC7).
 */
async function ruleIssues(rule: BadgeRule): Promise<string[]> {
  const issues = badgeRuleIssues(rule);
  const unknown = async (
    names: readonly string[],
    found: () => Promise<string[]>,
    noun: string,
    kind: 'eventId' | 'eventCategoryKey' | 'workshopDomainKey',
  ) => {
    if (names.length === 0) return;
    const held = new Set(await found());
    const missing = names.filter((n) => !held.has(n));
    if (missing.length > 0) {
      issues.push(
        `${noun} introuvable${missing.length > 1 ? 's' : ''} : ${missing.join(', ')}. ${handleProvenanceFr(kind)}`,
      );
    }
  };
  await unknown(
    rule.eventIds,
    async () =>
      (
        await prisma.event.findMany({
          where: { id: { in: [...rule.eventIds] } },
          select: { id: true },
        })
      ).map((e) => e.id),
    rule.eventIds.length > 1 ? 'Événements' : 'Événement',
    'eventId',
  );
  await unknown(
    rule.categoryKeys,
    async () =>
      (
        await prisma.eventConfig_Category.findMany({
          where: { key: { in: [...rule.categoryKeys] } },
          select: { key: true },
        })
      ).map((c) => c.key),
    rule.categoryKeys.length > 1 ? 'Catégories' : 'Catégorie',
    'eventCategoryKey',
  );
  await unknown(
    rule.domainKeys,
    async () =>
      (
        await prisma.workshop_Domain.findMany({
          where: { key: { in: [...rule.domainKeys] } },
          select: { key: true },
        })
      ).map((d) => d.key),
    rule.domainKeys.length > 1 ? 'Domaines' : 'Domaine',
    'workshopDomainKey',
  );
  return issues;
}

/**
 * Refuses a label another badge already reads as, whatever the case: two badges
 * a talent cannot tell apart in one collection are one badge written twice.
 */
async function refuseTakenLabel(key: string, label: string) {
  const holder = await prisma.badge_Definition.findFirst({
    where: { key: { not: key }, label: { equals: label, mode: 'insensitive' } },
    select: { key: true, label: true },
  });
  if (holder) {
    throw new OperationRefusedError(
      `Le nom « ${holder.label} » est déjà celui du badge « ${holder.key} ». Renommez celui-ci, ou donnez un autre nom.`,
    );
  }
}

/** The fields of a badge row that a rule does not hold. */
function definitionData(state: BadgeState) {
  return {
    label: state.label,
    condition: state.condition,
    groupKey: state.group,
    art: state.art,
  };
}

/** How many talents hold the badge, which is what keeps it from a delete. */
async function holdersOf(
  db: Prisma.TransactionClient,
  key: string,
): Promise<number> {
  return db.badge_Award.count({ where: { badgeKey: key } });
}

function heldRefusal(label: string, holders: number): string {
  return `Le badge « ${label} » ne peut pas être supprimé : ${holders} talent${holders > 1 ? 's l’ont' : ' l’a'} obtenu, et le supprimer le leur reprendrait. Archivez-le : plus personne ne l'obtient, et ceux qui l'ont le gardent. Seul un badge que personne n'a encore obtenu se supprime.`;
}

/**
 * Deletes a badge nobody holds, its rule with it. The row is locked before the
 * holders are counted: an award inserted meanwhile takes a key-share lock on
 * it, so it either committed before and is counted, or waits and then fails
 * its foreign key, and no award is ever deleted with the badge (`Badge_Award`
 * Restricts onto it besides).
 */
async function removeBadge(
  key: string,
  planDigest: string | undefined,
): Promise<WriteOutcome> {
  const before = await stateOf(key);
  if (!before) {
    throw new OperationRefusedError(
      `Badge introuvable : ${key}. ${handleProvenanceFr('badgeKey')}`,
    );
  }
  return runTwoStep({
    requestedDigest: planDigest,
    buildPlan: async () => {
      const replaces = await stateOf(key);
      const holders = await holdersOf(prisma, key);
      if (replaces && holders > 0) {
        throw new OperationRefusedError(heldRefusal(replaces.label, holders));
      }
      return { replaces, removes: true };
    },
    apply: async (plan) => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Badge_Definition" WHERE "key" = ${key} FOR UPDATE`;
        const holders = await holdersOf(tx, key);
        if (holders > 0) {
          throw new OperationRefusedError(heldRefusal(before.label, holders));
        }
        await tx.badge_Definition.delete({ where: { key } });
      });
      return { before: plan.replaces, after: null };
    },
  });
}

/** A badge as an answer carries it: without its drawing, which the caller sent. */
function withoutArt(state: BadgeState | null) {
  if (!state) return null;
  const { art: _art, ...rest } = state;
  return rest;
}

export async function writeBadge(
  params: BadgePatch,
  ctx: { origin: string },
): Promise<WriteOutcome> {
  const key = params.badgeKey;
  if (params.remove) return removeBadge(key, params.planDigest);
  // First, and whatever else the call carries: a drawing lands in talents'
  // pages, so nothing is weighed, not even a dry run, on one it would refuse.
  let art = params.art;
  if (art !== undefined) {
    const screened = screenBadgeArt(art);
    if (screened.problems.length > 0) {
      throw new OperationRefusedError(screened.problems.join(' '));
    }
    art = screened.art;
  }
  const before = await stateOf(key);
  const after = stateAfter({ ...params, art }, before);
  const rule = ruleOfState(after);

  if (before) {
    if (!sameBadgeRule(ruleOfState(before), rule)) {
      throw new OperationRefusedError(
        fixedBadgeRuleRefusal(before.label, await holdersOf(prisma, key)),
      );
    }
  } else {
    const issues = await ruleIssues(rule);
    if (issues.length > 0) throw new OperationRefusedError(issues.join(' '));
  }
  if (params.label !== undefined) await refuseTakenLabel(key, after.label);

  const counterLabel = isBadgeCounterKey(after.counter)
    ? BADGE_COUNTERS[after.counter].label
    : after.counter;

  return runTwoStep({
    requestedDigest: params.planDigest,
    // Read inside the plan, never before it: the digest has to describe the
    // badge and its holders at the moment of the call, which is what makes a
    // concurrent edit, or a talent coming to meet the rule, fail the apply
    // instead of awarding a number nobody approved.
    buildPlan: async () => {
      const replaces = await stateOf(key);
      const holders = after.archived
        ? []
        : await newBadgeHolders(
            prisma,
            replaces ? key : null,
            rule,
            new Date(),
          );
      return {
        replaces,
        writes: after,
        newHolders: metric(
          holders.length,
          after.archived
            ? 'Talents qui recevraient le badge : aucun, puisqu’il est archivé et que plus personne ne l’obtient.'
            : `Talents qui recevraient le badge à l'application, datés de ce jour : ceux qui remplissent maintenant sa règle (${counterLabel}, seuil ${after.threshold}) et ne l'ont pas déjà. Ils le gardent ensuite, même si leur compteur redescend ou si le badge est archivé.`,
        ),
      };
    },
    apply: async (plan) => {
      const archivedAt = archivedAtFor(
        params.archived,
        before?.archived ?? false,
      );
      const race = `Un autre appel vient d'écrire le badge « ${key} » ou son nom. Relancez celui-ci.`;
      await refusingRaces(race, () =>
        prisma.$transaction(async (tx) => {
          if (before) {
            await tx.badge_Definition.update({
              where: { key },
              data: { ...definitionData(after), archivedAt },
            });
          } else {
            await tx.badge_Definition.create({
              data: {
                key,
                ...definitionData(after),
                counterKey: rule.counterKey,
                threshold: rule.threshold,
                periodFrom: rule.periodFrom
                  ? dateKeyToDbDate(rule.periodFrom)
                  : null,
                periodTo: rule.periodTo ? dateKeyToDbDate(rule.periodTo) : null,
                archivedAt: archivedAt ?? null,
                events: {
                  create: rule.eventIds.map((eventId) => ({ eventId })),
                },
                categories: {
                  create: rule.categoryKeys.map((categoryKey) => ({
                    categoryKey,
                  })),
                },
                domains: {
                  create: rule.domainKeys.map((domainKey) => ({ domainKey })),
                },
              },
            });
          }
          if (!after.archived) {
            await awardDueBadges(tx, { now: new Date(), badgeKeys: [key] });
          }
        }),
      );
      const written = await stateOf(key);
      return {
        before: plan.replaces,
        after: written,
        // A receipt without the drawing, which the caller has just sent and
        // would otherwise pay to read back twice, and with the link to see it,
        // which is the next thing it needs (the certificate write's answer).
        answer: {
          before: withoutArt(plan.replaces),
          after: withoutArt(written),
          ...badgeStickerPreviewLink({
            badgeKey: key,
            label: after.label,
            origin: ctx.origin,
          }),
        },
      };
    },
  });
}
