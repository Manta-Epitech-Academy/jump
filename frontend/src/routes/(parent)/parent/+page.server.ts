import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;

  const children = await prisma.talent.findMany({
    where: { parentEmail },
    select: {
      id: true,
      prenom: true,
      nom: true,
      imageRightsSignedAt: true,
      _count: {
        select: { participations: true },
      },
    },
  });

  // Single child: redirect directly to detail page
  if (children.length === 1) {
    throw redirect(303, resolve(`/parent/enfant/${children[0].id}`));
  }

  // For each child, fetch the upcoming event
  const childrenWithEvents = await Promise.all(
    children.map(async (child) => {
      const upcomingParticipation = await prisma.participation.findFirst({
        where: {
          talentId: child.id,
          event: { date: { gt: new Date() } },
        },
        include: {
          event: { select: { id: true, titre: true, date: true } },
        },
        orderBy: { event: { date: 'asc' } },
      });

      return {
        id: child.id,
        prenom: child.prenom,
        nom: child.nom,
        imageRightsSigned: !!child.imageRightsSignedAt,
        eventsCount: child._count.participations,
        upcomingEvent: upcomingParticipation?.event ?? null,
      };
    }),
  );

  const parentName = locals.user.name ?? '';
  const parentLastName = parentName.split(' ').slice(1).join(' ') || parentName;

  return {
    parentName,
    parentLastName,
    children: childrenWithEvents,
  };
};
