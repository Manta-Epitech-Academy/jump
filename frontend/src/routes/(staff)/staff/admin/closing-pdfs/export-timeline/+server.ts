import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/db.ts';

// Conducted-at instant of every finalised closing (no identity). It feeds only
// the export menu's per-period and "depuis le dernier export" counts, so it lives
// off the page load rather than riding it: it's an unbounded scan of all done
// closings, needed only once the export popover opens. The menu fetches it
// lazily on open. Admin-gated by the /staff/admin/* route guard, same as the
// sibling export endpoint.
// Records no usage: its key counts downloads, and opening the menu is not one.
// The sibling export endpoint records it when the archive is actually asked for.
export const GET: RequestHandler = async () => {
  const rows = await prisma.closing_Record.findMany({
    where: { status: 'done' },
    select: { conductedAt: true },
    orderBy: { conductedAt: 'desc' },
  });
  // One shape for every export-menu timeline (`{ at, type? }`), so the menu needs
  // no per-caller parser. A closing synthesis has no type axis, so no `type`.
  return Response.json({
    timeline: rows.map((r) => ({ at: r.conductedAt.toISOString() })),
  });
};
