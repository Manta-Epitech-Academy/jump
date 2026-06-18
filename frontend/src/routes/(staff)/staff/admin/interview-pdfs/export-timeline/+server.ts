import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

// Conducted-at instant of every finalized interview (no identity). It feeds only
// the export menu's per-period and "depuis le dernier export" counts, so it lives
// off the page load rather than riding it: it's an unbounded scan of all done
// interviews, needed only once the export popover opens. The menu fetches it
// lazily on open. Admin-gated by the /staff/admin/* route guard, same as the
// sibling export endpoint.
export const GET: RequestHandler = async () => {
  const rows = await prisma.interview.findMany({
    where: { status: 'done' },
    select: { conductedAt: true },
    orderBy: { conductedAt: 'desc' },
  });
  return json({ timeline: rows.map((r) => r.conductedAt.toISOString()) });
};
