import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, params }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const workerToken = env.WORKER_API_TOKEN;

  if (!workerToken || token !== workerToken)
    throw error(401, 'Unauthorized: Invalid or missing token');

  const event = await prisma.event.findUnique({
    where: { id: params.event_ext_id },
  });
  if (!event) throw error(404, 'Event not found');

  const body = await request.json();

  let updated = 0;
  let created = 0;

  for (const t of body.talents) {
    const talentData = {
      external_id: t.external_id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email?.toLowerCase().trim() || null,
      phone: t.phone,
    };
    if (
      !talentData.external_id ||
      !talentData.first_name ||
      !talentData.last_name
    )
      throw error(
        400,
        'Each talent must have external_id, first_name and last_name',
      );

    const existing = await prisma.talent.findUnique({
      where: { externalId: talentData.external_id },
    });

    if (!existing) {
      await prisma.talent.create({
        data: {
          externalId: talentData.external_id,
          campusId: event.campusId,
          prenom: talentData.first_name,
          nom: talentData.last_name,
          email: talentData.email,
          phone: talentData.phone || null,
          xp: 0,
          eventsCount: 0,
        },
      });
      created++;
    } else {
      if (
        existing.prenom !== talentData.first_name ||
        existing.nom !== talentData.last_name ||
        existing.email !== talentData.email ||
        existing.phone !== talentData.phone ||
        existing.campusId !== event.campusId
      ) {
        await prisma.talent.update({
          where: { externalId: talentData.external_id },
          data: {
            prenom: talentData.first_name,
            nom: talentData.last_name,
            email: talentData.email,
            phone: talentData.phone || null,
            campusId: event.campusId
          },
        });
        updated++;
      }
    }
  }

  //TODO Adding talents to the event.


  return json({ created, updated });
};
