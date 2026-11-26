// ─── Badges (`Badge_Definition`, `Badge_Award`) ────────────────────────────
//
// A badge is data (#448): an admin describes one to Claude, which writes it
// over `write_badge`, and a talent earns it the moment a counter of theirs
// reaches its threshold, without asking anybody. This file is the closed half
// of that: the counters a rule may name, the filters each one takes, and the
// frame a badge's drawing is set in. Everything here is what the API accepts
// and what the read describes, so a list lives once.
//
// Counting is `services/badgeAwards.ts`, which reads each counter off the same
// rules the rest of Jump reads it with: an enrolment is one the talent's space
// shows, a visit is one the dev space counts (`domain/attendance.ts`), an
// activity is finished as `isActivityFinished` says.
//
// Kept free of SvelteKit modules: the seed imports it under plain Bun.

import type { DateKey } from './planningTime';
import { ATTENDED_DEFINITION } from './attendance';
import { VISIBLE_PARTICIPATION_DEFINITION } from './sfMemberStatus';

/** What narrows a counter. Each counter takes the ones it lists, and no other. */
export const BADGE_FILTERS = {
  events: 'événements',
  categories: 'catégories',
  period: 'période',
  domains: 'domaines',
} as const;

export type BadgeFilter = keyof typeof BADGE_FILTERS;

type BadgeCounter = {
  /** What an admin calls it, in French. */
  label: string;
  /**
   * What the counter counts for one talent, in French, quoted by the read and
   * by every refusal that names it. Says what the filters narrow, never how.
   */
  definition: string;
  /** The filters a rule on this counter may carry. */
  filters: readonly BadgeFilter[];
};

/**
 * The counters a badge rule may name: a closed catalogue, because each is a
 * query somebody wrote and checked against the rest of Jump. A badge on one of
 * them needs no development; a new counter is one entry here and its query in
 * `services/badgeAwards.ts`, made when a badge needs it (#448).
 *
 * Nothing is collected for a counter: each reads facts Jump already holds,
 * the run of days included (#447).
 */
export const BADGE_COUNTERS = {
  xp: {
    label: 'XP total',
    definition: "Le total d'XP du talent, tous gains confondus.",
    filters: [],
  },
  enrolments: {
    label: 'Inscriptions',
    definition:
      "Le nombre d'événements activés par un admin où le talent est inscrit, " +
      `${VISIBLE_PARTICIPATION_DEFINITION}. ` +
      'Les filtres événements, catégories et période ne retiennent que les événements qui y répondent.',
    filters: ['events', 'categories', 'period'],
  },
  attended: {
    label: 'Événements où le talent est venu',
    definition:
      "Le nombre d'événements activés par un admin où le talent fait partie des talents " +
      `${ATTENDED_DEFINITION}. ` +
      'Les filtres événements, catégories et période ne retiennent que les événements qui y répondent.',
    filters: ['events', 'categories', 'period'],
  },
  finishedActivities: {
    label: 'Activités finalisées',
    definition:
      "Le nombre d'activités que le talent a terminées, toutes leurs étapes validées. " +
      "Le filtre domaines ne retient que les activités rangées dans l'un d'eux, archivé ou non.",
    filters: ['domains'],
  },
  dailyFirstPlaces: {
    label: 'Premières places au jeu du jour',
    definition:
      'Le nombre de jeux du jour que le talent a finis à la première place du classement où sa partie a été rangée, au moment où il a fini : ' +
      'celui de son campus, ou le classement de tous les campus quand aucun campus ne lui était encore rattaché. ' +
      'Une première place dépassée plus tard dans la journée compte toujours, comme le bonus d’XP qu’elle a rapporté.',
    filters: [],
  },
  signInStreak: {
    label: "Jours de connexion d'affilée",
    definition:
      "La série en cours de jours d'affilée où le talent a ouvert Jump, comptés dans le fuseau de son campus. " +
      'Le badge est obtenu le jour où la série atteint le seuil et reste obtenu quand elle repart à zéro.',
    filters: [],
  },
  questionnaires: {
    label: 'Questionnaires remplis',
    definition:
      'Le nombre de questionnaires que le talent a envoyés depuis son espace, animés par son canard. Une réponse publique, envoyée sans compte, ne compte pas.',
    filters: [],
  },
} as const satisfies Record<string, BadgeCounter>;

export type BadgeCounterKey = keyof typeof BADGE_COUNTERS;

export const BADGE_COUNTER_KEYS = Object.keys(
  BADGE_COUNTERS,
) as BadgeCounterKey[];

export function isBadgeCounterKey(key: string): key is BadgeCounterKey {
  return Object.hasOwn(BADGE_COUNTERS, key);
}

/**
 * The groups a badge is filed under, in the mockup's order. The collection
 * (#551) never shows them: they are the order it is drawn in, group by group,
 * as the mockup lays out its Epidex.
 */
export const BADGE_GROUPS = {
  parcours: 'Parcours',
  succes: 'Succès',
  wtf: 'WTF',
} as const;

export type BadgeGroupKey = keyof typeof BADGE_GROUPS;

export const BADGE_GROUP_KEYS = Object.keys(BADGE_GROUPS) as BadgeGroupKey[];

/**
 * Ceiling on a badge's drawing, in characters. The mockup's heaviest sticker,
 * a run of days in pixels, is about 7 000: room for one like it, not for an
 * embedded picture.
 */
export const BADGE_ART_MAX = 10_000;

/**
 * The faces a drawing may write in, as its `font-family` names them: the two
 * the mockup's stickers use, both loaded by every page that shows one. Any
 * other would fall back to whatever the reader's device has.
 */
export const BADGE_ART_FONTS = ['Space Mono', 'Anton'] as const;

/**
 * The square a badge is drawn in, in user units: the sticker fills it, and its
 * white outline may run past the edge, which the frame leaves room for.
 */
export const BADGE_ART_SIZE = 80;

/**
 * A badge's drawing in its frame, as one `<svg>` element. The drawing is only
 * what goes inside: the frame is code, so every sticker is the same size, with
 * the same margin for its outline, whatever its author wrote. Shared by the
 * collection and by the preview an admin is shown, so the two cannot differ.
 *
 * `art` must have been through `screenBadgeArt` (server/badgeArtSanitize.ts),
 * as every stored drawing has: this concatenates, it does not escape.
 */
export function badgeStickerSvg(art: string): string {
  const margin = 4;
  const box = BADGE_ART_SIZE + 2 * margin;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${box} ${box}" overflow="visible" aria-hidden="true" focusable="false">${art}</svg>`;
}

/** Ceiling on a label: the badge's name under it, not a sentence. */
export const BADGE_LABEL_MAX = 40;

/** Ceiling on a condition: one line under a badge still to earn. */
export const BADGE_CONDITION_MAX = 120;

/** Ceiling on a key: it spells a label, so it gets the label's. */
export const BADGE_KEY_MAX = BADGE_LABEL_MAX;

/**
 * A badge's rule: a counter, a threshold, and the counter's filters. An empty
 * list and a null bound filter nothing. Several values in one list are
 * alternatives (any of these categories); several filters all apply.
 */
export type BadgeRule = {
  counterKey: string;
  threshold: number;
  eventIds: readonly string[];
  categoryKeys: readonly string[];
  domainKeys: readonly string[];
  /** First day of the period, inclusive, on the event's first day. */
  periodFrom: DateKey | null;
  /** Last day of the period, inclusive. */
  periodTo: DateKey | null;
};

/** Which filters a rule actually sets. */
export function filtersOf(rule: BadgeRule): BadgeFilter[] {
  const set: BadgeFilter[] = [];
  if (rule.eventIds.length > 0) set.push('events');
  if (rule.categoryKeys.length > 0) set.push('categories');
  if (rule.periodFrom !== null || rule.periodTo !== null) set.push('period');
  if (rule.domainKeys.length > 0) set.push('domains');
  return set;
}

/**
 * Why a rule cannot be written, in French, as sentences that say what to fix,
 * or an empty list. Only what the rule says of itself: whether the events,
 * categories and domains it names exist is the writer's to check.
 */
export function badgeRuleIssues(rule: BadgeRule): string[] {
  if (!isBadgeCounterKey(rule.counterKey)) {
    return [
      `Le compteur « ${rule.counterKey} » n'existe pas. Les compteurs sont ${BADGE_COUNTER_KEYS.map((k) => `« ${k} » (${BADGE_COUNTERS[k].label})`).join(', ')}.`,
    ];
  }
  const counter = BADGE_COUNTERS[rule.counterKey];
  const issues: string[] = [];
  if (!Number.isInteger(rule.threshold) || rule.threshold < 1) {
    issues.push(
      `Le seuil doit être un nombre entier d'au moins 1, pas ${rule.threshold}.`,
    );
  }
  const accepted: readonly BadgeFilter[] = counter.filters;
  const refused = filtersOf(rule).filter((f) => !accepted.includes(f));
  if (refused.length > 0) {
    const names = refused.map((f) => BADGE_FILTERS[f]).join(', ');
    issues.push(
      accepted.length === 0
        ? `Le compteur « ${counter.label} » ne se filtre pas : retirez le filtre ${names}.`
        : `Le compteur « ${counter.label} » ne se filtre pas par ${names}. Il accepte : ${accepted.map((f) => BADGE_FILTERS[f]).join(', ')}.`,
    );
  }
  if (
    rule.periodFrom !== null &&
    rule.periodTo !== null &&
    rule.periodFrom > rule.periodTo
  ) {
    issues.push(
      `La période commence le ${rule.periodFrom}, après sa fin le ${rule.periodTo} : inversez les deux dates.`,
    );
  }
  return issues;
}

/** Whether two rules say the same thing, whatever the order of their lists. */
export function sameBadgeRule(a: BadgeRule, b: BadgeRule): boolean {
  const sameSet = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length &&
    [...x].sort().join('\n') === [...y].sort().join('\n');
  return (
    a.counterKey === b.counterKey &&
    a.threshold === b.threshold &&
    sameSet(a.eventIds, b.eventIds) &&
    sameSet(a.categoryKeys, b.categoryKeys) &&
    sameSet(a.domainKeys, b.domainKeys) &&
    a.periodFrom === b.periodFrom &&
    a.periodTo === b.periodTo
  );
}

/**
 * Why a written rule may not change, in the one wording the API gives: an
 * award says the talent met THIS rule, and outlives the counter and the badge.
 * What to do instead depends on whether anybody holds it: a badge nobody holds
 * is removed and written again, a held one is archived and replaced.
 */
export function fixedBadgeRuleRefusal(label: string, holders: number): string {
  const instead =
    holders === 0
      ? "Personne ne l'a encore obtenu : supprimez-le (remove), puis écrivez-le à nouveau avec la nouvelle règle, sous la même clé et le même nom."
      : `${holders} talent${holders > 1 ? "s l'ont" : " l'a"} obtenu sur cette règle et le garde${holders > 1 ? 'nt' : ''} : archivez ce badge et créez-en un autre, sous une autre clé et un autre nom, avec la nouvelle règle.`;
  return `La règle du badge « ${label} » ne change plus une fois le badge créé. ${instead} Son nom, sa condition, son groupe et son visuel, eux, se modifient.`;
}
