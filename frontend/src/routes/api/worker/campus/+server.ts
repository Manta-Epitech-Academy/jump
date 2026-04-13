import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const workerToken = env.WORKER_API_TOKEN;

  if (!workerToken || token !== workerToken) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  const campuses = await prisma.campus.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return json(campuses);
};
