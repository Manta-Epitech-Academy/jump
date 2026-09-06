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
  priorYearDecision,
  type ImageRightsDecision,
} from '$lib/domain/imageRights';
import {
  LATEST_IMAGE_RIGHTS_DECISION_ORDER,
  recordImageRightsDecision,
} from '$lib/server/services/imageRightsService';

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
      // onboarding: same rationale as `/parent/signature` and `/parent/reglement`.
      parentPrenom: true,
      parentNom: true,
      // Which dossier the decision on this page belongs to, so the reminder
      // below can tell a previous year's answer from the one in force.
      onboardingSchoolYear: true,
      // Last decision taken and the year it answered for, shown on the form for
      // the same reason as on `/parent/signature`: the decision is annual, so a
      // guardian can meet this question again with an answer already on file.
      imageRightsRecords: {
        orderBy: LATEST_IMAGE_RIGHTS_DECISION_ORDER,
        take: 1,
        select: { decision: true, schoolYear: true },
      },
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
        planningSlots: { orderBy: { startTime: 'asc' as const } },
      },
    },
  };

  // Fetch today's participation with its programme slots
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

  // Fetch upcoming events with their programme slots
  const upcomingParticipations = await prisma.participation.findMany({
    where: {
      talentId,
      event: { date: { gt: filterDateEnd } },
    },
    include: planningInclude,
    orderBy: { event: { date: 'asc' } },
  });

  return {
    parentLastName: getParentLastName(locals.user.name),
    hasMultipleChildren: siblingCount > 1,
    todayPlanning: todayParticipation
      ? {
          eventName: todayParticipation.event.titre,
          eventDate: todayParticipation.event.date,
          timeSlots: todayParticipation.event.planningSlots
            .filter((slot) => slot.activityType !== 'orga')
            .map(toParentSlot),
        }
      : null,
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
      parentPrenom: child.parentPrenom,
      parentNom: child.parentNom,
      imageRightsStatus: imageRightsStatus(child),
      // Only a PREVIOUS year's answer is a reminder. This page also renders the
      // form under « Modifier ma décision », on a decision still in force for the
      // dossier in hand: telling that guardian they "avaient" decided and that
      // the question is re-asked every year would describe a re-ask that is not
      // happening, while they are simply changing their mind inside one year.
      previousDecision: priorYearDecision(
        child.imageRightsRecords[0],
        child.onboardingSchoolYear,
      ),
    },
    upcomingEvents: upcomingParticipations.map((p) => ({
      id: p.event.id,
      name: p.event.titre,
      date: p.event.date,
      timeSlots: p.event.planningSlots
        .filter((slot) => slot.activityType !== 'orga')
        .map(toParentSlot),
    })),
  };
};

/**
 * One programme slot in the shape the parent page renders.
 *
 * `activities` stays a one-element list: the component reads a list, and a slot
 * has held exactly one activity since the schema stopped pretending otherwise.
 */
function toParentSlot(slot: {
  id: string;
  startTime: Date;
  endTime: Date;
  nom: string;
  activityType: string;
}) {
  return {
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    activities: [{ id: slot.id, name: slot.nom, type: slot.activityType }],
  };
}

function isDecision(value: unknown): value is ImageRightsDecision {
  return (IMAGE_RIGHTS_DECISIONS as readonly string[]).includes(
    value as string,
  );
}

export const actions: Actions = {
  // Lets a guardian record (or later revise) the image-rights decision for one
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
      decision,
      signerPrenom,
      signerNom,
      relationship,
      city,
    });

    return { success: true, decision };
  },
};
