import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { isVisibleInDevSpace } from '$lib/domain/sfMemberStatus';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin') {
    return new Response('Unauthorized', { status: 401 });
  }

  const eventId = params.id;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, titre: true, publicName: true, externalId: true },
  });

  if (!event) {
    return new Response('Event not found', { status: 404 });
  }

  const participations = await prisma.participation.findMany({
    where: { eventId },
    select: {
      id: true,
      sfMemberStatus: true,
      createdAt: true,
      updatedAt: true,
      talent: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          phone: true,
          user: { select: { email: true } },
          school: { select: { name: true } },
        },
      },
    },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const rows = participations.map((p) => {
    const isVisible = isVisibleInDevSpace(p.sfMemberStatus);
    return {
      id: p.id,
      talentId: p.talent.id,
      nom: p.talent.nom,
      prenom: p.talent.prenom,
      email: p.talent.user?.email ?? null,
      phone: p.talent.phone ?? null,
      schoolName: p.talent.school?.name ?? null,
      sfMemberStatus: p.sfMemberStatus,
      isVisibleInDevSpace: isVisible,
      updatedAt: p.updatedAt,
    };
  });

  // Compute breakdown stats
  const statusCounts: Record<string, number> = {};
  let totalVisible = 0;
  let totalHidden = 0;

  for (const r of rows) {
    const key = r.sfMemberStatus ?? 'UNSPECIFIED';
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    if (r.isVisibleInDevSpace) {
      totalVisible++;
    } else {
      totalHidden++;
    }
  }

  return json({
    event: {
      id: event.id,
      displayName: event.publicName || event.titre,
      externalId: event.externalId,
    },
    total: rows.length,
    totalVisible,
    totalHidden,
    statusCounts,
    participations: rows,
  });
};
