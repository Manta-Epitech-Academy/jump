import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import type { EventCategoryView } from '$lib/domain/eventCategory';

/**
 * The event category catalogue (`EventConfig_Category`), as every reader sees it:
 * the admin config wizard offers it, the admin API returns it. Its one writer is
 * `write_event_category` (`adminApi/writes/eventCategories.ts`); which category an
 * event carries is written by `EventService.updateEventConfig` and the bulk
 * event write.
 */

/** The columns a category is shown with, for an `include` or a `select`. */
export const EVENT_CATEGORY_SELECT = {
  key: true,
  label: true,
  color: true,
  archivedAt: true,
} satisfies Prisma.EventConfig_CategorySelect;

type EventCategoryRow = Prisma.EventConfig_CategoryGetPayload<{
  select: typeof EVENT_CATEGORY_SELECT;
}>;

/** A row as it is shown. */
export function eventCategoryView(row: EventCategoryRow): EventCategoryView {
  return {
    key: row.key,
    label: row.label,
    color: row.color,
    archived: row.archivedAt !== null,
  };
}

export type EventCategoryListItem = EventCategoryView & {
  /** Events that carry it, archived categories included. */
  attachedEvents: number;
};

export const EventCategoryService = {
  /**
   * Every category, archived ones included, alphabetical by label. A reader
   * that offers a choice keeps the active ones and the one already carried.
   */
  async list(): Promise<EventCategoryListItem[]> {
    const rows = await prisma.eventConfig_Category.findMany({
      orderBy: { label: 'asc' },
      select: {
        ...EVENT_CATEGORY_SELECT,
        _count: { select: { events: true } },
      },
    });
    return rows.map((row) => ({
      ...eventCategoryView(row),
      attachedEvents: row._count.events,
    }));
  },
};
