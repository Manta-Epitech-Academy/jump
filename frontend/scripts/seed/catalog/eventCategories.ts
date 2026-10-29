/**
 * The event categories, as the 2027 mockup draws them and in its exact colours:
 * Coding Club in blue, Spécial (Back to Epitech) in green, Stage in pink, Camp
 * in orange. Production holds none yet - the team authors them over
 * the admin API - so these are the mockup's, not a measurement, and PROFILE.md
 * has no share per category to apply: which event carries which is placed by
 * the scenario that knows what kind of event it built, never drawn.
 *
 * One more, archived, because « archived and still carried » is the state the
 * archive rule exists for: the open days keep the category the team retired.
 * Its colour is the palest one a team could pick, which is the swatch whose
 * border has to do the work on a white card.
 *
 * Keyed on their natural key, which is the identity the API names, so a seeded
 * key is one `write_event_category` could have written (no `sd_` prefix, which
 * its pattern refuses). That makes them a create-only catalogue like the
 * feedback forms: a full generation takes them back by key (`wipe`), and
 * `--catalog-only` never writes them, since a populated database's categories
 * are the team's.
 */

import type { PrismaClient } from '@prisma/client';
import { campLabel } from './events';

export const EVENT_CATEGORY = {
  CODING_CLUB: 'coding-club',
  SPECIAL: 'special',
  STAGE: 'stage',
  CAMP: 'camp',
  OPEN_DAY: 'portes-ouvertes',
} as const;

type EventCategorySpec = {
  readonly key: string;
  readonly label: string;
  /** `#rrggbb`, lowercase as the write stores it. */
  readonly color: string;
  readonly archived: boolean;
};

export const EVENT_CATEGORIES: readonly EventCategorySpec[] = [
  {
    key: EVENT_CATEGORY.CODING_CLUB,
    label: 'Coding Club',
    color: '#013afb',
    archived: false,
  },
  {
    key: EVENT_CATEGORY.SPECIAL,
    label: 'Spécial',
    color: '#00ff97',
    archived: false,
  },
  {
    key: EVENT_CATEGORY.STAGE,
    label: 'Stage',
    color: '#ff1ef7',
    archived: false,
  },
  {
    key: EVENT_CATEGORY.CAMP,
    label: 'Camp',
    color: '#ff5f3a',
    archived: false,
  },
  {
    key: EVENT_CATEGORY.OPEN_DAY,
    label: 'Portes ouvertes',
    color: '#f6f7fb',
    archived: true,
  },
];

export const EVENT_CATEGORY_KEYS = EVENT_CATEGORIES.map((c) => c.key);

/**
 * The category of a Coding Club session, read off its date the way its name
 * is (`campLabel`): a session in a holiday week is a camp, the rentrée one is
 * the special operation, and every other one is a club.
 */
export function clubCategoryOf(firstDay: Date): string {
  const camp = campLabel(firstDay);
  if (camp === null) return EVENT_CATEGORY.CODING_CLUB;
  return camp === 'Back to Epitech'
    ? EVENT_CATEGORY.SPECIAL
    : EVENT_CATEGORY.CAMP;
}

/** Create-only: a key already present is left exactly as it stands. */
export async function seedEventCategories(
  prisma: PrismaClient,
  anchor: Date,
): Promise<number> {
  const { count } = await prisma.eventConfig_Category.createMany({
    data: EVENT_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      color: category.color,
      archivedAt: category.archived ? anchor : null,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });
  return count;
}
