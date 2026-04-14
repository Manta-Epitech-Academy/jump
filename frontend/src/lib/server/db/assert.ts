import { error } from '@sveltejs/kit';
import { prisma } from '../db';

/**
 * Verifies that a resource belongs to the given student profile.
 * Throws 403 if ownership doesn't match.
 */
export async function assertStudentOwns(
  talentId: string,
  resourceId: string,
  model: 'stepsProgress' | 'portfolioItem' | 'participation',
) {
  let ownerId: string;

  switch (model) {
    case 'stepsProgress': {
      const r = await prisma.stepsProgress.findUniqueOrThrow({
        where: { id: resourceId },
        select: { talentId: true },
      });
      ownerId = r.talentId;
      break;
    }
    case 'portfolioItem': {
      const r = await prisma.portfolioItem.findUniqueOrThrow({
        where: { id: resourceId },
        select: { talentId: true },
      });
      ownerId = r.talentId;
      break;
    }
    case 'participation': {
      const r = await prisma.participation.findUniqueOrThrow({
        where: { id: resourceId },
        select: { talentId: true },
      });
      ownerId = r.talentId;
      break;
    }
  }

  if (ownerId !== talentId) {
    throw error(403, 'Accès refusé : cette ressource ne vous appartient pas.');
  }
}

/**
 * Verifies that an event belongs to the given campus.
 * Throws 403 if campus doesn't match.
 */
export async function assertEventCampus(eventId: string, campusId: string) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { campusId: true },
  });

  if (event.campusId !== campusId) {
    throw error(
      403,
      'Accès refusé : cet événement appartient à un autre campus.',
    );
  }
}
