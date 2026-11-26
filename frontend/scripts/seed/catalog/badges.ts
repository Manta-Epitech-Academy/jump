/**
 * The badges (#448), as the 2027 mockup draws them: its labels, conditions,
 * outlines, pictograms and colours, one per counter of `BADGE_COUNTERS` at
 * least, so every rule shape has a badge to look at. Production holds none
 * yet - the PO creates them over `write_badge` once the system ships - so
 * these are the mockup's, not a measurement. The mockup's three CTFd podium
 * badges are left out, as #448 retired them, and the daily game's first place
 * takes the trophy.
 *
 * Three states no badge of the mockup shows are placed rather than drawn: a
 * rule on one named event (the issue's « a fait le Halloween Camp »), a rule on
 * an archived domain, which still counts, and an archived badge its holders
 * keep.
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
  BadgeIcon,
  BadgeShape,
} from '../../../src/lib/domain/badges';
import { dateKeyToDbDate } from '../../../src/lib/domain/eventPresence';
import { awardDueBadges } from '../../../src/lib/server/services/badgeAwards';
import type { Clock } from '../clock';
import { SEED_ID_PREFIX } from '../ids';
import { EVENT_CATEGORY } from './eventCategories';
import { WORKSHOP_DOMAIN } from './workshopDomains';

type BadgeSpec = {
  readonly key: string;
  readonly label: string;
  readonly condition: string;
  readonly group: BadgeGroupKey;
  readonly shape: BadgeShape;
  readonly icon: BadgeIcon;
  readonly text: string | null;
  readonly background: string;
  readonly ring: string;
  readonly dashed?: boolean;
  readonly ink: string;
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

const BLUE = '#013afb';
const GREEN = '#00ff97';
const PINK = '#ff1ef7';
const ORANGE = '#ff5f3a';
const INK = '#0b0d14';
const WHITE = '#ffffff';

export const BADGES: readonly BadgeSpec[] = [
  {
    key: 'millesime',
    label: 'Millésime',
    condition: "Venu·e au moins une fois dans l'année",
    group: 'parcours',
    shape: 'circle',
    icon: 'car',
    text: null,
    background: GREEN,
    ring: INK,
    dashed: true,
    ink: INK,
    counter: 'attended',
    threshold: 1,
    thisYear: true,
  },
  {
    key: 'finisher-seconde',
    label: 'Finisher Seconde',
    condition: 'A terminé le stage de Seconde',
    group: 'parcours',
    shape: 'shield',
    icon: 'flag',
    text: '2NDE',
    background: PINK,
    ring: WHITE,
    ink: WHITE,
    counter: 'attended',
    threshold: 1,
    categories: [EVENT_CATEGORY.STAGE],
  },
  {
    key: 'revenant',
    label: 'Revenant',
    condition: 'A participé au Back to Epitech',
    group: 'parcours',
    shape: 'hexagon',
    icon: 'zombie',
    text: null,
    background: INK,
    ring: GREEN,
    ink: GREEN,
    counter: 'attended',
    threshold: 1,
    categories: [EVENT_CATEGORY.SPECIAL],
  },
  {
    key: 'addict',
    label: 'Addict',
    condition: 'A participé à 5 Coding Clubs',
    group: 'parcours',
    shape: 'hexagon',
    icon: 'code',
    text: '×5',
    background: BLUE,
    ring: GREEN,
    ink: WHITE,
    counter: 'attended',
    threshold: 5,
    categories: [EVENT_CATEGORY.CODING_CLUB],
  },
  {
    key: 'campeur',
    label: 'Campeur',
    condition: 'A fait le dernier camp des vacances',
    group: 'parcours',
    shape: 'shield',
    icon: 'flag',
    text: null,
    background: ORANGE,
    ring: WHITE,
    ink: WHITE,
    counter: 'attended',
    threshold: 1,
    lastCamp: true,
  },
  {
    key: 'inscrit-fidele',
    label: 'Fidèle',
    condition: 'Inscrit·e à 3 événements',
    group: 'parcours',
    shape: 'circle',
    icon: 'check',
    text: '3',
    background: WHITE,
    ring: BLUE,
    ink: BLUE,
    counter: 'enrolments',
    threshold: 3,
  },
  {
    key: 'premiers-pas',
    label: 'Premiers Pas',
    condition: 'A finalisé sa première activité',
    group: 'succes',
    shape: 'circle',
    icon: 'check',
    text: '1',
    background: BLUE,
    ring: WHITE,
    ink: WHITE,
    counter: 'finishedActivities',
    threshold: 1,
  },
  {
    key: 'high-five',
    label: 'High Five',
    condition: 'A finalisé 5 activités',
    group: 'succes',
    shape: 'circle',
    icon: 'check',
    text: '5',
    background: BLUE,
    ring: GREEN,
    ink: WHITE,
    counter: 'finishedActivities',
    threshold: 5,
  },
  {
    key: 'cyberpunk',
    label: 'CyberPunk',
    condition: 'A finalisé une activité Cyber',
    group: 'succes',
    shape: 'hexagon',
    icon: 'lock',
    text: null,
    background: BLUE,
    ring: WHITE,
    ink: WHITE,
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.CYBERSECURITY],
  },
  {
    key: 'cerveau-bionique',
    label: 'Cerveau Bionique',
    condition: 'A finalisé une activité IA',
    group: 'succes',
    shape: 'hexagon',
    icon: 'chip',
    text: null,
    background: PINK,
    ring: WHITE,
    ink: WHITE,
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.AI_DATA],
  },
  {
    key: 'insert-coin',
    label: 'Insert Coin',
    condition: 'A finalisé une activité Game Dev',
    group: 'succes',
    shape: 'hexagon',
    icon: 'gamepad',
    text: null,
    background: PINK,
    ring: INK,
    ink: INK,
    counter: 'finishedActivities',
    threshold: 1,
    domains: [WORKSHOP_DOMAIN.GAME_DEV],
  },
  {
    key: 'mecano',
    label: 'Mécano',
    condition: 'A finalisé une activité Robotique',
    group: 'succes',
    shape: 'hexagon',
    icon: 'robot',
    text: null,
    background: ORANGE,
    ring: WHITE,
    ink: WHITE,
    counter: 'finishedActivities',
    threshold: 1,
    // The archived domain the robotics one replaced still counts.
    domains: [WORKSHOP_DOMAIN.ROBOTICS, WORKSHOP_DOMAIN.ELECTRONICS],
  },
  {
    key: 'champion',
    label: 'Champion',
    condition: 'Premier·e au jeu du jour',
    group: 'succes',
    shape: 'circle',
    icon: 'trophy',
    text: '1ER',
    background: '#ffc93c',
    ring: INK,
    ink: INK,
    counter: 'dailyFirstPlaces',
    threshold: 1,
  },
  {
    key: 'mille-xp',
    label: 'Mille Pattes',
    condition: 'A gagné 1 000 XP',
    group: 'succes',
    shape: 'circle',
    icon: 'flame',
    text: '1K',
    background: INK,
    ring: GREEN,
    ink: GREEN,
    counter: 'xp',
    threshold: 1000,
  },
  {
    key: 'coin-coin',
    label: 'Coin Coin',
    condition: 'A parlé au canard',
    group: 'wtf',
    shape: 'circle',
    icon: 'duck',
    text: null,
    background: BLUE,
    ring: WHITE,
    dashed: true,
    ink: WHITE,
    counter: 'questionnaires',
    threshold: 1,
  },
  {
    key: 'en-feu',
    label: 'En Feu',
    condition: 'Connecté·e 5 jours d’affilée',
    group: 'wtf',
    shape: 'shield',
    icon: 'flame',
    text: '5 J',
    background: ORANGE,
    ring: WHITE,
    ink: WHITE,
    counter: 'signInStreak',
    threshold: 5,
  },
  {
    key: 'pionnier',
    label: 'Pionnier',
    condition: 'Était là quand les badges sont arrivés',
    group: 'wtf',
    shape: 'hexagon',
    icon: 'app',
    text: null,
    background: PINK,
    ring: INK,
    ink: INK,
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
  for (const badge of BADGES) {
    if (badge.lastCamp && !lastCamp) {
      throw new Error(
        `Le badge « ${badge.key} » vise le dernier camp terminé, et la génération n'en a écrit aucun.`,
      );
    }
    await prisma.badge_Definition.create({
      data: {
        key: badge.key,
        label: badge.label,
        condition: badge.condition,
        groupKey: badge.group,
        shape: badge.shape,
        icon: badge.icon,
        text: badge.text,
        backgroundColor: badge.background,
        ringColor: badge.ring,
        ringDashed: badge.dashed ?? false,
        iconColor: badge.ink,
        counterKey: badge.counter,
        threshold: badge.threshold,
        periodFrom: badge.thisYear ? dateKeyToDbDate(`${year}-01-01`) : null,
        periodTo: badge.thisYear ? dateKeyToDbDate(`${year}-12-31`) : null,
        createdAt: clock.today,
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
