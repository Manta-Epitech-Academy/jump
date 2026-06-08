import type { PageServerLoad } from './$types';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';

const PER_PAGE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
  requireFlag(locals, 'coding_club');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const search = url.searchParams.get('q') || '';
  const niveau = url.searchParams.get('niveau') || '';
  const db = scopedPrisma(getCampusId(locals));

  const where: any = {};

  if (search) {
    const sanitized = search.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, '').trim();
    if (sanitized) {
      where.OR = [
        { nom: { contains: sanitized, mode: 'insensitive' } },
        { prenom: { contains: sanitized, mode: 'insensitive' } },
      ];
    }
  }

  if (niveau) {
    where.niveau = niveau;
  }

  const [students, totalItems] = await Promise.all([
    db.talent.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: true },
    }),
    db.talent.count({ where }),
  ]);

  return {
    students,
    totalPages: Math.ceil(totalItems / PER_PAGE),
    totalItems,
    currentPage: page,
  };
};
