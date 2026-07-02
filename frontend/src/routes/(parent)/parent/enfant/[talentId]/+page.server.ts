import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { now } from '@internationalized/date';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { getStartOfDay } from '$lib/utils';
import { getParentLastName } from '$lib/domain/parent';
import {
  IMAGE_RIGHTS_DECISIONS,
  imageRightsStatus,
  type ImageRightsDecision,
} from '$lib/domain/imageRights';
import { recordImageRightsDecision } from '$lib/server/services/imageRightsService';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
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
      imageRightsDecision: true,
      // Pre-fill the signer-name inputs from what the talent entered during
      // onboarding — same rationale as `/parent/signature` and `/parent/reglement`.
      parentPrenom: true,
      parentNom: true,
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

  // Calculate today boundaries
  const tz = getBrowserTimezone(cookies);
  const filterDateStart = getStartOfDay(tz);
  const tzNow = now(tz);
  const endOfDay = tzNow.set({
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
  const filterDateEnd = endOfDay.toDate();
  const filterDateStartDate = new Date(filterDateStart);

  const planningInclude = {
    event: {
      include: {
        planning: {
          include: {
            timeSlots: {
              include: {
                activity: {
                  select: {
                    id: true,
                    nom: true,
                    activityType: true,
                    difficulte: true,
                  },
                },
              },
              orderBy: { startTime: 'asc' as const },
            },
          },
        },
      },
    },
  };

  // Fetch today's participation with full planning chain (timeSlots → activity)
  const todayParticipation = await prisma.participation.findFirst({
    where: {
      talentId,
      event: {
        date: { gte: filterDateStartDate, lte: filterDateEnd },
      },
    },
    include: planningInclude,
    orderBy: { event: { date: 'asc' } },
  });

  // Fetch upcoming events with full planning chain
  const upcomingParticipations = await prisma.participation.findMany({
    where: {
      talentId,
      event: { date: { gt: filterDateEnd } },
    },
    include: planningInclude,
    orderBy: { event: { date: 'asc' } },
  });

  const parentName = locals.user.name ?? '';

  return {
    parentName,
    parentLastName: getParentLastName(parentName),
    hasMultipleChildren: siblingCount > 1,
    todayPlanning: todayParticipation
      ? {
          eventName: todayParticipation.event.titre,
          eventDate: todayParticipation.event.date,
          timeSlots: (todayParticipation.event.planning?.timeSlots ?? [])
            .filter(
              (slot) => slot.activity && slot.activity.activityType !== 'orga',
            )
            .map((slot) => ({
              id: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              activities: [
                {
                  id: slot.activity!.id,
                  name: slot.activity!.nom,
                  type: slot.activity!.activityType,
                  difficulty: slot.activity!.difficulte,
                },
              ],
            })),
        }
      : null,
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      imageRightsStatus: imageRightsStatus(child),
    },
    upcomingEvents: upcomingParticipations.map((p) => ({
      id: p.event.id,
      name: p.event.titre,
      date: p.event.date,
      timeSlots: (p.event.planning?.timeSlots ?? [])
        .filter(
          (slot) => slot.activity && slot.activity.activityType !== 'orga',
        )
        .map((slot) => ({
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          activities: [
            {
              id: slot.activity!.id,
              name: slot.activity!.nom,
              type: slot.activity!.activityType,
              difficulty: slot.activity!.difficulte,
            },
          ],
        })),
    })),
  };
};

function isDecision(value: unknown): value is ImageRightsDecision {
  return (IMAGE_RIGHTS_DECISIONS as readonly string[]).includes(
    value as string,
  );
}

export const actions: Actions = {
  // Lets a guardian record — or later revise — the image-rights decision for one
  // child straight from their dashboard. The legal text promises revocation "à
  // tout moment", so a settled decision must stay editable, not lock the parent
  // out. Reuses the same write path as the onboarding signature flow.
  decide: async ({ request, locals, params }) => {
    if (!locals.user || locals.user.role !== 'parent') {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const signerPrenom = (formData.get('signerPrenom') as string)?.trim();
    const signerNom = (formData.get('signerNom') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const decision = formData.get('decision');

    const child = await prisma.talent.findUnique({
      where: { id: params.talentId },
      select: { id: true, prenom: true, nom: true, parentEmail: true },
    });

    if (!child || child.parentEmail !== locals.user.email) {
      throw error(403, 'Accès non autorisé pour cet enfant.');
    }

    if (!isDecision(decision)) {
      return {
        error: "Veuillez choisir d'autoriser ou de refuser le droit à l'image.",
      };
    }
    if (!signerPrenom || signerPrenom.length < 1) {
      return { error: 'Veuillez entrer votre prénom.' };
    }
    if (!signerNom || signerNom.length < 1) {
      return { error: 'Veuillez entrer votre nom.' };
    }
    if (!relationship) {
      return { error: 'Veuillez indiquer votre qualité (mère, père, tuteur).' };
    }
    if (!city) {
      return { error: 'Veuillez indiquer la ville.' };
    }

    await recordImageRightsDecision({
      talentId: child.id,
      studentName: `${child.prenom} ${child.nom}`,
      decision,
      signerPrenom,
      signerNom,
      relationship,
      city,
    });

    return { success: true, decision };
  },
};
