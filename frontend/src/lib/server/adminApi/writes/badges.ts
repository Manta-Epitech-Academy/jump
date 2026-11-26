/**
 * The write on the badge catalogue (#448): create a badge, rename it, restyle
 * it, regroup it, archive or unarchive it, identified by its key.
 *
 * One write for the entity, with patch semantics: a key that does not exist yet
 * creates a badge (its label, condition, look and rule are then required), and
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
 * the rule against (AC1), and the apply awards exactly what the plan counted or
 * is refused as stale. The count is in the plan on purpose: a talent who comes
 * to meet the rule between the two calls changes the digest, and the admin
 * approves the number that is awarded, not an older one.
 *
 * There is deliberately no delete: `config_badges` returns every key, so a
 * delete would be a target a model could pick on its own (class C), and it
 * would take back what talents earned. "Remove" is `archived: true`: nobody
 * earns it any more, and those who did keep it.
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
  type BadgeIcon,
  type BadgeRule,
  type BadgeShape,
} from '#lib/domain/badges.ts';
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
  shape: string;
  icon: string;
  text: string | null;
  backgroundColor: string;
  ringColor: string;
  ringDashed: boolean;
  iconColor: string;
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
  shape: true,
  icon: true,
  text: true,
  backgroundColor: true,
  ringColor: true,
  ringDashed: true,
  iconColor: true,
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
    shape: row.shape,
    icon: row.icon,
    text: row.text,
    backgroundColor: row.backgroundColor,
    ringColor: row.ringColor,
    ringDashed: row.ringDashed,
    iconColor: row.iconColor,
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
  shape?: BadgeShape;
  icon?: BadgeIcon;
  text?: string | null;
  backgroundColor?: string;
  ringColor?: string;
  ringDashed?: boolean;
  iconColor?: string;
  counter?: string;
  threshold?: number;
  eventIds?: string[];
  categoryKeys?: string[];
  domains?: string[];
  periodFrom?: DateKey | null;
  periodTo?: DateKey | null;
  archived?: boolean;
  planDigest?: string;
};

/** The fields a badge cannot be created without, by the name the call uses. */
const REQUIRED_TO_CREATE = [
  'label',
  'condition',
  'group',
  'shape',
  'icon',
  'backgroundColor',
  'ringColor',
  'iconColor',
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
    shape: pick('shape', params.shape, ''),
    icon: pick('icon', params.icon, ''),
    text: pick('text', params.text === null ? null : params.text?.trim(), null),
    backgroundColor: pick(
      'backgroundColor',
      params.backgroundColor?.toLowerCase(),
      '',
    ),
    ringColor: pick('ringColor', params.ringColor?.toLowerCase(), ''),
    ringDashed: pick('ringDashed', params.ringDashed, false),
    iconColor: pick('iconColor', params.iconColor?.toLowerCase(), ''),
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
    shape: state.shape,
    icon: state.icon,
    text: state.text,
    backgroundColor: state.backgroundColor,
    ringColor: state.ringColor,
    ringDashed: state.ringDashed,
    iconColor: state.iconColor,
  };
}

export async function writeBadge(params: BadgePatch): Promise<WriteOutcome> {
  const key = params.badgeKey;
  const before = await stateOf(key);
  const after = stateAfter(params, before);
  const rule = ruleOfState(after);

  if (before) {
    if (!sameBadgeRule(ruleOfState(before), rule)) {
      throw new OperationRefusedError(fixedBadgeRuleRefusal(before.label));
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
      return { before: plan.replaces, after: await stateOf(key) };
    },
  });
}
