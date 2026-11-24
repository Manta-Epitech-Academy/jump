import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '#lib/server/db.ts';
import { requireParentSession } from '#lib/server/auth/guards.ts';
import {
  findOwnChild,
  requireOwnChild,
} from '#lib/server/services/parentChildren.ts';
import { parentSignerRelationship } from '#lib/domain/profile.ts';
import {
  decisionOf,
  imageRightsSignatureSchema,
  parentSignatureFormId,
  signerOf,
} from '#lib/validation/parentSignature.ts';
import {
  getParentLastName,
  splitTodayAndUpcoming,
} from '#lib/domain/parent.ts';
import { eventPublicName, UNNAMED_EVENT_NAME } from '#lib/domain/event.ts';
import { shownEnrolmentWhere } from '#lib/domain/eventReadiness.ts';
import {
  imageRightsStatus,
  priorYearDecision,
} from '#lib/domain/imageRights.ts';
import {
  LATEST_IMAGE_RIGHTS_DECISION_ORDER,
  recordImageRightsDecision,
} from '#lib/server/services/imageRightsService.ts';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireParentSession(locals);

  const parentEmail = locals.user.email;
  const { talentId } = params;

  const child = await findOwnChild(parentEmail, talentId, {
    id: true,
    prenom: true,
    nom: true,
    imageRightsDecision: true,
    // Pre-fill the signer fields from what the talent entered during
    // onboarding: same rationale as `/parent/signature` and `/parent/reglement`.
    parentPrenom: true,
    parentNom: true,
    parentType: true,
    parentCivilite: true,
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
  });

  // Not one of this guardian's children: back to their own list.
  if (!child) throw redirect(303, resolve('parent'));

  // Check how many children the parent has (for UI: hide back button if single child)
  const siblingCount = await prisma.talent.count({
    where: { parentEmail },
  });

  const planningInclude = {
    event: {
      include: {
        planningSlots: { orderBy: { startTime: 'asc' as const } },
        // The day is read on the event's campus clock, not the reader's.
        campus: { select: { timezone: true } },
      },
    },
  };

  // Today's and the upcoming events, with their programme slots: the enrolments
  // the child's own space shows (#516), never a campaign nobody prepared. Which
  // day is today is each event's campus's question (`splitTodayAndUpcoming`);
  // the query only leaves out what is past on every clock. A campus day began
  // at most 25 hours ago (on the night its clocks go back), so two days back
  // never drops the event of today, wherever its campus is.
  const now = new Date();
  const { today: todayParticipation, upcoming: upcomingParticipations } =
    splitTodayAndUpcoming(
      await prisma.participation.findMany({
        where: {
          talentId,
          ...shownEnrolmentWhere({
            date: { gte: new Date(now.getTime() - 2 * 86_400_000) },
          }),
        },
        include: planningInclude,
        orderBy: { event: { date: 'asc' } },
      }),
      now,
    );

  return {
    parentLastName: getParentLastName(locals.user.name),
    hasMultipleChildren: siblingCount > 1,
    todayPlanning: todayParticipation
      ? {
          eventName:
            eventPublicName(todayParticipation.event) ?? UNNAMED_EVENT_NAME,
          timezone: todayParticipation.event.campus.timezone,
          timeSlots: todayParticipation.event.planningSlots
            .filter((slot) => slot.activityType !== 'orga')
            .map(toParentSlot),
        }
      : null,
    form: await superValidate(
      {
        talentId: child.id,
        signerPrenom: child.parentPrenom ?? '',
        signerNom: child.parentNom ?? '',
        relationship: parentSignerRelationship(
          child.parentType,
          child.parentCivilite,
        ),
      },
      zod4(imageRightsSignatureSchema),
      { id: parentSignatureFormId('image-rights', child.id), errors: false },
    ),
    child: {
      id: child.id,
      prenom: child.prenom,
      nom: child.nom,
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
      name: eventPublicName(p.event) ?? UNNAMED_EVENT_NAME,
      date: p.event.date,
      timezone: p.event.campus.timezone,
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

export const actions: Actions = {
  // Lets a guardian record (or later revise) the image-rights decision for one
  // child straight from their dashboard. The legal text promises revocation "à
  // tout moment", so a settled decision must stay editable, not lock the parent
  // out. Reuses the same write path as the onboarding signature flow.
  decide: async ({ request, locals, params }) => {
    requireParentSession(locals);
    const form = await superValidate(request, zod4(imageRightsSignatureSchema));
    if (!form.valid) return fail(400, { form });
    // The page decides for the child it shows, never for one a post names.
    if (form.data.talentId !== params.talentId) {
      return message(form, 'Ce formulaire ne concerne pas cet enfant.', {
        status: 400,
      });
    }

    const child = await requireOwnChild(locals.user.email, params.talentId, {
      id: true,
    });
    const decision = decisionOf(form.data);
    await recordImageRightsDecision({
      talentId: child.id,
      decision,
      ...signerOf(form.data),
    });

    return message(form, { decision });
  },
};
