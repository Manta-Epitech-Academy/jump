import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';

const STUDENT_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  niveauDifficulte: true,
  eventsCount: true,
  xp: true,
  level: true,
  badges: true,
} as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  if (
    !locals.user ||
    (locals.user.role !== 'staff' && locals.user.role !== 'admin')
  ) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = scopedPrisma(getCampusId(locals));

  const query = url.searchParams.get('q') || '';
  const top = url.searchParams.has('top');

  // Default view: most active students (highest participation count)
  if (top) {
    const results = await db.studentProfile.findMany({
      take: 20,
      orderBy: [{ eventsCount: 'desc' }, { nom: 'asc' }, { prenom: 'asc' }],
      select: STUDENT_SELECT,
    });
    return json(results);
  }

  if (!query || query.length < 2) {
    return json([]);
  }

  const sanitized = query.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, '').trim();
  if (!sanitized) return json([]);

  const results = await db.studentProfile.findMany({
    take: 20,
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    where: {
      OR: [
        { nom: { contains: sanitized, mode: 'insensitive' } },
        { prenom: { contains: sanitized, mode: 'insensitive' } },
      ],
    },
    select: STUDENT_SELECT,
  });

  return json(results);
};
