import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { searchAnnuaire } from '$lib/server/annuaire';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json([], { status: 401 });

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json([]);

  return json(await searchAnnuaire(q));
};
