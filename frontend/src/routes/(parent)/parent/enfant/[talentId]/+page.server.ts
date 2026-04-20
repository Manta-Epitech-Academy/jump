import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;
  const { talentId } = params;

  const child = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentEmail: true,
      imageRightsSignedAt: true,
    },
  });

  // Security: verify this child belongs to the parent
  if (!child || child.parentEmail !== parentEmail) {
    throw redirect(303, resolve('/parent'));
  }

  // Check how many children the parent has (for UI: hide back button if single child)
  const siblingCount = await prisma.talent.count({
    where: { parentEmail },
  });

  // Fetch upcoming event
  const upcomingParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: { date: { gt: new Date() } },
    },
    include: {
      event: { select: { id: true, titre: true, date: true } },
    },
    orderBy: { event: { date: 'asc' } },
  });

  // Fetch past participations with activities for history
  const participations = await prisma.participation.findMany({
    where: { talentId, event: { date: { lte: new Date() } } },
    include: {
      event: { select: { id: true, titre: true, date: true } },
      activities: {
        include: {
          activity: {
            select: { id: true, nom: true, activityType: true },
          },
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  return {
    parentName: locals.user.name,
    hasMultipleChildren: siblingCount > 1,
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      imageRightsSigned: !!child.imageRightsSignedAt,
    },
    upcomingEvent: upcomingParticipation?.event ?? null,
    participations: participations.map((p) => ({
      id: p.id,
      eventName: p.event.titre,
      eventDate: p.event.date,
      isPresent: p.isPresent,
      activities: p.activities
        .filter((a) => a.activity.activityType !== 'orga')
        .map((a) => ({
          id: a.activity.id,
          name: a.activity.nom,
          type: a.activity.activityType,
        })),
    })),
  };
};
