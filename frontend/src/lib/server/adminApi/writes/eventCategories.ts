/**
 * The class A write on the event category catalogue: create, rename, recolour,
 * archive or unarchive one category, identified by its key.
 *
 * One write for the entity, with patch semantics like the event's own: a key that
 * does not exist yet creates a category (a label and a colour are then
 * required), and on an existing key only the fields given change. Bounded to the
 * one named row, sends nothing, and reversible by writing the previous value
 * back, which the audit row keeps.
 *
 * There is deliberately no delete. `config_event_categories` returns every key,
 * so a delete would be a target a model could pick on its own, which is class C;
 * and an event, a preset or a badge rule that names a category has to keep
 * resolving it. "Remove" is `archived: true`: the category stops being offered,
 * and everything that carries it keeps it (`EventService.updateEventConfig`
 * holds that rule for both doors). Both foreign keys onto it are `Restrict`, so a
 * hand-deletion of one still in use fails loudly.
 *
 * Which category an event carries is not written here: it is a field of the
 * event's configuration (`write_event_config`, `bulk_event_config`).
 */

import { prisma } from '$lib/server/db';
import {
  EVENT_CATEGORY_SELECT,
  eventCategoryView,
} from '$lib/server/services/eventCategories';
import { OperationRefusedError } from '../errors';
import { archivedAtFor, refusingRaces } from './catalogue';
import type { WriteOutcome } from '../plan';

export type EventCategoryPatch = {
  categoryKey: string;
  label?: string;
  /** `#rrggbb`, any case; stored lowercase. */
  color?: string;
  archived?: boolean;
};

async function stateOf(key: string) {
  const row = await prisma.eventConfig_Category.findUnique({
    where: { key },
    select: EVENT_CATEGORY_SELECT,
  });
  if (!row) return null;
  const { key: categoryKey, ...view } = eventCategoryView(row);
  return { categoryKey, ...view };
}

/**
 * Refuses a label another category already reads as, whatever the case: two
 * entries a person cannot tell apart in a legend are one category typed twice,
 * and the calendar filter would offer both.
 */
async function refuseTakenLabel(key: string, label: string) {
  const holder = await prisma.eventConfig_Category.findFirst({
    where: { key: { not: key }, label: { equals: label, mode: 'insensitive' } },
    select: { key: true, label: true },
  });
  if (holder) {
    throw new OperationRefusedError(
      `Le libellé « ${holder.label} » est déjà celui de la catégorie « ${holder.key} ». Renommez celle-ci, ou donnez un autre libellé.`,
    );
  }
}

export async function writeEventCategory(
  params: EventCategoryPatch,
): Promise<WriteOutcome> {
  const key = params.categoryKey;
  const before = await stateOf(key);
  const label = params.label?.trim();
  const color = params.color?.toLowerCase();
  if (label) await refuseTakenLabel(key, label);
  const archivedAt = archivedAtFor(params.archived, before?.archived ?? false);
  const race = `Un autre appel vient d'écrire la catégorie « ${key} » ou son libellé. Relancez celui-ci.`;

  if (before) {
    await refusingRaces(race, () =>
      prisma.eventConfig_Category.update({
        where: { key },
        data: { label, color, archivedAt },
      }),
    );
  } else {
    if (!label || !color) {
      throw new OperationRefusedError(
        `La catégorie « ${key} » n'existe pas encore : pour la créer, donnez-lui un libellé (label) et une couleur (color).`,
      );
    }
    await refusingRaces(race, () =>
      prisma.eventConfig_Category.create({
        data: { key, label, color, archivedAt },
      }),
    );
  }

  return { applied: true, before, after: await stateOf(key) };
}
