import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '#lib/server/db.ts';
import { requireParentSession } from '#lib/server/auth/guards.ts';
import { requireOwnChild } from '#lib/server/services/parentChildren.ts';
import { priorYearDecision } from '#lib/domain/imageRights.ts';
import { parentSignerRelationship } from '#lib/domain/profile.ts';
import {
  LATEST_IMAGE_RIGHTS_DECISION_ORDER,
  recordImageRightsDecision,
} from '#lib/server/services/imageRightsService.ts';
import {
  decisionOf,
  imageRightsSignatureSchema,
  parentSignatureFormId,
  signerOf,
} from '#lib/validation/parentSignature.ts';

export const load: PageServerLoad = async ({ locals }) => {
  requireParentSession(locals);

  // Règlement intérieur comes first in the flow. If any child's is still
  // unsigned, send the parent back to that step, even on a direct hit here.
  const unsignedRules = await prisma.talent.count({
    where: { parentEmail: locals.user.email, parentRulesSignedAt: null },
  });
  if (unsignedRules > 0) {
    throw redirect(303, resolve('parent/reglement'));
  }

  // Children whose guardian has not yet decided for the dossier in hand: a
  // refusal is a settled decision and drops out here just as an authorization
  // does. The column is a projection of the talent's most recent dossier, so a
  // returning family reappears here the year their child reopens one: the
  // decision is taken once per school year.
  const undecidedChildren = await prisma.talent.findMany({
    where: {
      parentEmail: locals.user.email,
      imageRightsDecidedAt: null,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      // Pre-fill the signer fields from what the talent entered for their
      // guardian during onboarding. The parent can still override (e.g. legal
      // name differs from what the talent typed).
      parentPrenom: true,
      parentNom: true,
      parentType: true,
      parentCivilite: true,
      // Which dossier this ask is about, so the reminder below can tell a
      // previous year's answer from this year's.
      onboardingSchoolYear: true,
      // What this guardian last decided, for the year they decided it. Shown on
      // the form so somebody asked a second time is not answering blind: without
      // it a returning parent sees a question identical to last year's with no
      // trace of the answer they gave, and a mis-click silently reverses a
      // refusal.
      imageRightsRecords: {
        orderBy: LATEST_IMAGE_RIGHTS_DECISION_ORDER,
        take: 1,
        select: { decision: true, schoolYear: true },
      },
    },
  });

  if (undecidedChildren.length === 0) {
    throw redirect(303, resolve('parent/merci'));
  }

  return {
    children: await Promise.all(
      undecidedChildren.map(async (child) => ({
        id: child.id,
        prenom: child.prenom,
        nom: child.nom,
        // Every child here is undecided for the dossier in hand, so the latest
        // ledger row is necessarily a previous year's. Resolved through the
        // shared rule anyway, rather than trusted: it is the same rule the child
        // page needs, where the form is also reachable on a decision still in
        // force.
        previousDecision: priorYearDecision(
          child.imageRightsRecords[0],
          child.onboardingSchoolYear,
        ),
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
          {
            id: parentSignatureFormId('image-rights', child.id),
            errors: false,
          },
        ),
      })),
    ),
  };
};

export const actions: Actions = {
  decide: async ({ request, locals }) => {
    requireParentSession(locals);
    const form = await superValidate(request, zod4(imageRightsSignatureSchema));
    if (!form.valid) return fail(400, { form });

    const child = await requireOwnChild(locals.user.email, form.data.talentId, {
      id: true,
      prenom: true,
      nom: true,
    });
    const decision = decisionOf(form.data);

    // Records the decision + enqueues the matching PDF atomically, then fires
    // the (non-blocking) generation. The decided-at timestamp is set now, so
    // the `remaining` count below already excludes this child.
    await recordImageRightsDecision({
      talentId: child.id,
      decision,
      ...signerOf(form.data),
    });

    // Any child still awaiting a decision keeps the parent on this page.
    const remaining = await prisma.talent.count({
      where: {
        parentEmail: locals.user.email,
        imageRightsDecidedAt: null,
      },
    });

    if (remaining === 0) {
      throw redirect(303, resolve('parent/merci'));
    }

    return message(form, {
      signedFor: `${child.prenom} ${child.nom}`,
      decision,
    });
  },
};
