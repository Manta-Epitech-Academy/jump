/**
 * The badges (#448), as the 2027 mockup's Epidex shows them (#551): its names,
 * conditions and drawings (`badgeArt.ts`), in its order, at least one per
 * counter of `BADGE_COUNTERS`, so every rule shape has a badge to look at.
 * Production holds none yet - the PO creates them over `write_badge` once the
 * system ships - so these are the mockup's, not a measurement.
 *
 * Left out of the mockup's: its 2nd and 3rd podium places, as #448 retired the
 * CTFd podium, and the two this world has no way to tell apart from another
 * (« Finisher 3e », whose stage shares the category of the stage de seconde,
 * and « Webmaster », on a domain the seeded catalogue does not file). Added to
 * it, drawn in the same hand: a badge on enrolments and one on XP, the two
 * counters the mockup does not use, and three states it does not show: a rule
 * on one named event (the issue's « a fait le Halloween Camp »), a rule on an
 * archived domain, which still counts, and an archived badge its holders keep.
 *
 * Written after the world is flushed, because a rule may name a seeded event
 * and every award reads the seeded facts. The awards are not placed: they are
 * written by `awardDueBadges`, the function the application itself awards
 * with, over the generated talents only and at the anchor, so a seeded award
 * is exactly one the application would have written the day the PO created the
 * badges (AC2 of #448). It imports nothing from SvelteKit, which is why the
 * generator may run it.
 *
 * Keyed on their natural key, which is the identity the API names, so a key is
 * one `write_badge` could have written (no `sd_` prefix, which its pattern
 * refuses). A full generation takes them back by key, with every award of
 * theirs (`wipe`), and `--catalog-only` never writes them.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BadgeCounterKey,
  BadgeGroupKey,
} from '../../../src/lib/domain/badges';
import { dateKeyToDbDate } from '../../../src/lib/domain/eventPresence';
import { awardDueBadges } from '../../../src/lib/server/services/badgeAwards';
import type { Clock } from '../clock';
import { SEED_ID_PREFIX } from '../ids';
import { BADGE_ART } from './badgeArt';
import { EVENT_CATEGORY } from './eventCategories';
import { WORKSHOP_DOMAIN } from './workshopDomains';

type BadgeSpec = {
  /** Also the key of its drawing in `BADGE_ART`. */
  readonly key: string;
  /** `{yy}` and `{yyyy}` are the anchor's year, as « Vignette 26 » prints it. */
  readonly label: string;
  readonly condition: string;
  readonly group: BadgeGroupKey;
  readonly counter: BadgeCounterKey;
  readonly threshold: number;
  readonly categories?: readonly string[];
  readonly domains?: readonly string[];
  /** Count only the anchor's calendar year. */
  readonly thisYear?: boolean;
  /** Count only the most recent seeded camp that is over. */
  readonly lastCamp?: boolean;
  /** Archived once awarded: those who earned it keep it. */
  readonly retired?: boolean;
};

export const BADGES: readonly BadgeSpec[] = [
  {
    key: 'millesime',
    label: 'Vignette {yy}',
    condition: 'Venu·e au moins une fois en {yyyy}',
    group: 'parcours',
    counter: 'attended',
    threshold: 1,
    thisYear: true,
  },
  {
    key: 'finisher-seconde',
    label: 'Finisher 2nde',
    condition: 'A terminé le stage de Seconde',
    group: 'parcours',
    counter: 'attended',
    threshold: 1,
    categories: [EVENT_CATEGORY.STAGE],
  },
  {
    key: 'revenant',
    label: 'Revenant',
    condition: 'A participé au Back to Epitech',
    group: 'parcours',
    counter: 'attended',
    threshold: 1,
    categories: [EVENT_CATEGORY.SPECIAL],
  },
  {
    key: 'addict',
    label: 'Addict',
    condition: 'A participé à 5 Coding Clubs',
    group: 'parcours',
    counter: 'attended',
    threshold: 5,
    categories: [EVENT_CATEGORY.CODING_CLUB],
  },
  {
    key: 'campeur',
    label: 'Campeur',
    condition: 'A fait le dernier camp des vacances',
    group: 'parcours',
    counter: 'attended',
    threshold: 1,
    lastCamp: true,
  },
  {
    key: 'inscrit-fidele',
    label: 'Fidèle',
    condition: 'Inscrit·e à 3 événements',
    group: 'parcours',
    counter: 'enrolments',
    threshold: 3,
  },
  {
    key: 'premiers-pas',
    label: 'Premiers Pas',
    condition: 'A finalisé sa première activité',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
  },
  {
    key: 'high-five',
    label: 'High Five',
    condition: 'A finalisé 5 activités',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 5,
  },
  {
    key: 'dix-sur-dix',
    label: 'Dix sur Dix',
    condition: 'A finalisé 10 activités',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 10,
  },
  {
    key: 'cyberpunk',
    label: 'CyberPunk',
    condition: 'A finalisé une activité Cyber',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.CYBERSECURITY],
  },
  {
    key: 'cerveau-bionique',
    label: 'Cerveau Bionique',
    condition: 'A finalisé une activité IA',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.AI_DATA],
  },
  {
    key: 'mecano',
    label: 'Mécano',
    condition: 'A finalisé une activité Robotique',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
    // The archived domain the robotics one replaced still counts.
    domains: [WORKSHOP_DOMAIN.ROBOTICS, WORKSHOP_DOMAIN.ELECTRONICS],
  },
  {
    key: 'hello-world',
    label: 'Hello World',
    condition: 'A finalisé une activité Algorithmie',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.ALGORITHMICS],
  },
  {
    key: 'insert-coin',
    label: 'Insert Coin',
    condition: 'A finalisé une activité Game Dev',
    group: 'succes',
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.GAME_DEV],
  },
  {
    key: 'champion',
    label: 'Champion',
    condition: 'Premier·e au jeu du jour',
    group: 'succes',
    counter: 'dailyFirstPlaces',
    threshold: 1,
  },
  {
    key: 'mille-xp',
    label: 'Mille Pattes',
    condition: 'A gagné 1 000 XP',
    group: 'succes',
    counter: 'xp',
    threshold: 1000,
  },
  {
    key: 'coin-coin',
    label: 'Coin Coin',
    condition: 'A parlé au canard',
    group: 'wtf',
    counter: 'questionnaires',
    threshold: 1,
  },
  {
    key: 'en-feu',
    label: 'En Feu',
    condition: 'Connecté·e 5 jours d’affilée',
    group: 'wtf',
    counter: 'signInStreak',
    threshold: 5,
  },
  {
    key: 'inarretable',
    label: 'Inarrêtable',
    condition: 'Connecté·e 10 jours d’affilée',
    group: 'wtf',
    counter: 'signInStreak',
    threshold: 10,
  },
  {
    key: 'legende',
    label: 'Légende',
    condition: 'Connecté·e 30 jours d’affilée',
    group: 'wtf',
    counter: 'signInStreak',
    threshold: 30,
  },
  {
    key: 'pionnier',
    label: 'Pionnier',
    condition: 'Était là quand les badges sont arrivés',
    group: 'wtf',
    counter: 'xp',
    threshold: 1,
    retired: true,
  },
];

export const BADGE_KEYS = BADGES.map((badge) => badge.key);

/**
 * Writes the badges, awards them to the generated talents at the anchor, then
 * retires the ones the catalogue says are retired. Returns the badges and the
 * awards written.
 */
export async function seedBadges(
  prisma: PrismaClient,
  clock: Clock,
): Promise<{ badges: number; awards: number }> {
  const year = clock.dateKey(clock.today).slice(0, 4);
  const withYear = (text: string) =>
    text.replaceAll('{yyyy}', year).replaceAll('{yy}', year.slice(2));
  const lastCamp = await prisma.event.findFirst({
    where: {
      id: { startsWith: SEED_ID_PREFIX },
      categoryKey: EVENT_CATEGORY.CAMP,
      date: { lt: clock.today },
    },
    orderBy: { date: 'desc' },
    select: { id: true },
  });

  let badges = 0;
  for (const [index, badge] of BADGES.entries()) {
    const art = BADGE_ART[badge.key];
    if (art === undefined) {
      throw new Error(
        `Le badge « ${badge.key} » n'a pas de dessin dans badgeArt.ts.`,
      );
    }
    if (badge.lastCamp && !lastCamp) {
      throw new Error(
        `Le badge « ${badge.key} » vise le dernier camp terminé, et la génération n'en a écrit aucun.`,
      );
    }
    await prisma.badge_Definition.create({
      data: {
        key: badge.key,
        label: withYear(badge.label),
        condition: withYear(badge.condition),
        groupKey: badge.group,
        art: withYear(art),
        counterKey: badge.counter,
        threshold: badge.threshold,
        periodFrom: badge.thisYear ? dateKeyToDbDate(`${year}-01-01`) : null,
        periodTo: badge.thisYear ? dateKeyToDbDate(`${year}-12-31`) : null,
        // A second apart, in the catalogue's order: the collection orders a
        // group's badges by creation, and the mockup's order is the order
        // they were written in.
        createdAt: new Date(clock.today.getTime() + index * 1000),
        updatedAt: clock.today,
        events: {
          create: badge.lastCamp && lastCamp ? [{ eventId: lastCamp.id }] : [],
        },
        categories: {
          create: (badge.categories ?? []).map((categoryKey) => ({
            categoryKey,
          })),
        },
        domains: {
          create: (badge.domains ?? []).map((domainKey) => ({ domainKey })),
        },
      },
    });
    badges += 1;
  }

  const talents = await prisma.talent.findMany({
    where: { id: { startsWith: SEED_ID_PREFIX } },
    select: { id: true },
  });
  const awards = await awardDueBadges(prisma, {
    now: clock.today,
    badgeKeys: BADGE_KEYS,
    talentIds: talents.map((talent) => talent.id),
  });

  await prisma.badge_Definition.updateMany({
    where: { key: { in: BADGES.filter((b) => b.retired).map((b) => b.key) } },
    data: { archivedAt: clock.today },
  });
  return { badges, awards };
}
