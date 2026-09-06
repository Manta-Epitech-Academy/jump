import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Conducted-at instant of every finalised closing (no identity). It feeds only
// the export menu's per-period and "depuis le dernier export" counts, so it lives
// off the page load rather than riding it: it's an unbounded scan of all done
// closings, needed only once the export popover opens. The menu fetches it
// lazily on open. Admin-gated by the /staff/admin/* route guard, same as the
// sibling export endpoint.
export const GET: RequestHandler = async ({ locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_CLOSING_PDFS_EXPORT, { locals });
  const rows = await prisma.closing_Record.findMany({
    where: { status: 'done' },
    select: { conductedAt: true },
    orderBy: { conductedAt: 'desc' },
  });
  // One shape for every export-menu timeline (`{ at, type? }`), so the menu needs
  // no per-caller parser. A closing synthesis has no type axis, so no `type`.
  return json({
    timeline: rows.map((r) => ({ at: r.conductedAt.toISOString() })),
  });
};
