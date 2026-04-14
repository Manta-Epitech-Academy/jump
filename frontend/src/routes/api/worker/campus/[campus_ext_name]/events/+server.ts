import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, params }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const workerToken = env.WORKER_API_TOKEN;

  if (!workerToken || token !== workerToken) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  const campus = await prisma.campus.findUnique({
    where: { external_name: params.campus_ext_name },
  });
  if (!campus) throw error(404, 'Campus not found');

  const body = await request.json();
  if (!Array.isArray(body.events))
    throw error(400, 'Missing or invalid "event" array');

  let created = 0;
  let updated = 0;

  for (const e of body.events) {
    const eventData = {
      external_id: e.external_id,
      title: e.title,
    };
    if (!eventData.external_id || !eventData.title)
      throw error(400, 'Each event must have id and title');
    const existing = await prisma.event.findUnique({
      where: { id: eventData.external_id },
    });

    const campus = await prisma.campus.findUnique({
      where: { external_name: params.campus_ext_name },
    });
    if (!campus) throw error(404, 'Campus not found');

    if (!existing) {
      await prisma.event.create({
        data: {
          id: eventData.external_id,
          date: new Date(),
          titre: eventData.title,
          campusId: campus.id,
        },
      });
      created++;
    } else if (existing.titre !== eventData.title || existing.campusId !== campus.id) {
      await prisma.event.update({
        where: { id: eventData.external_id },
        data: { titre: eventData.title, campusId: campus.id}
      });
      updated++;
    }
  }

  return json({ created, updated });
};
