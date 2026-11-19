import type { RequestHandler } from './$types';

import { searchAnnuaire } from '#lib/server/annuaire.ts';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return Response.json([], { status: 401 });

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return Response.json([]);

  return Response.json(await searchAnnuaire(q));
};
