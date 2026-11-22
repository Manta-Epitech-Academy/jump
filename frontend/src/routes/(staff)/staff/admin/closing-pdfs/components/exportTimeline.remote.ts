import { z } from 'zod';
import { prisma } from '#lib/server/db.ts';
import { gatedQuery } from '#lib/server/remoteFunctions.ts';

/**
 * Conducted-at instant of every finalised closing (no identity), for the
 * per-period and "depuis le dernier export" counts of `ExportMenu`.
 *
 * Asked when the menu opens rather than shipped with the page load: it is an
 * unbounded scan of every done closing, which only the menu needs. It records
 * no usage: its key counts downloads, and opening the menu is not one. The
 * export endpoint records it when the archive is actually asked for.
 */
export const closingExportTimeline = gatedQuery(
  { admin: true },
  z.undefined(),
  async () => {
    const rows = await prisma.closing_Record.findMany({
      where: { status: 'done' },
      select: { conductedAt: true },
      orderBy: { conductedAt: 'desc' },
    });
    return rows.map((r) => ({ at: r.conductedAt.getTime() }));
  },
);
