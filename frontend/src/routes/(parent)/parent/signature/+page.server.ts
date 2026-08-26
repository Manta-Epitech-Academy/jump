import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import {
  IMAGE_RIGHTS_DECISIONS,
  type ImageRightsDecision,
} from '$lib/domain/imageRights';
import { recordImageRightsDecision } from '$lib/server/services/imageRightsService';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  // Règlement intérieur comes first in the flow. If any child's is still
  // unsigned, send the parent back to that step — even on a direct hit here.
  const unsignedRules = await prisma.talent.count({
    where: { parentEmail: locals.user.email, parentRulesSignedAt: null },
  });
  if (unsignedRules > 0) {
    throw redirect(303, resolve('/parent/reglement'));
  }

  // Children whose guardian has not yet decided for the dossier in hand — a
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
      // Pre-fill the signer-name inputs from what the talent entered for their
      // guardian during onboarding. The parent can still override (e.g. legal
      // name differs from what the talent typed).
      parentPrenom: true,
      parentNom: true,
      parentType: true,
      parentCivilite: true,
      // What this guardian last decided, for the year they decided it. Shown on
      // the form so somebody asked a second time is not answering blind: without
      // it a returning parent sees a question identical to last year's with no
      // trace of the answer they gave, and a mis-click silently reverses a
      // refusal.
      imageRightsRecords: {
        orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { decision: true, schoolYear: true },
      },
    },
  });

  if (undecidedChildren.length === 0) {
    throw redirect(303, resolve('/parent/merci'));
  }

  return {
    children: undecidedChildren.map(({ imageRightsRecords, ...child }) => ({
      ...child,
      previousDecision: imageRightsRecords[0] ?? null,
    })),
  };
};

function isDecision(value: unknown): value is ImageRightsDecision {
  return (IMAGE_RIGHTS_DECISIONS as readonly string[]).includes(
    value as string,
  );
}

export const actions: Actions = {
  decide: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'parent') {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const talentId = (formData.get('talentId') as string)?.trim();
    const signerPrenom = (formData.get('signerPrenom') as string)?.trim();
    const signerNom = (formData.get('signerNom') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const decision = formData.get('decision');

    if (!talentId) {
      return { error: 'Identifiant enfant manquant.' };
    }

    // Security: verify this child belongs to the authenticated parent
    const profile = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, prenom: true, nom: true, parentEmail: true },
    });

    if (!profile || profile.parentEmail !== locals.user.email) {
      throw error(403, 'Accès non autorisé pour cet enfant.');
    }

    if (!isDecision(decision)) {
      return {
        error: "Veuillez choisir d'autoriser ou de refuser le droit à l'image.",
        talentId,
      };
    }

    if (!signerPrenom || signerPrenom.length < 1) {
      return { error: 'Veuillez entrer votre prénom.', talentId };
    }

    if (!signerNom || signerNom.length < 1) {
      return { error: 'Veuillez entrer votre nom.', talentId };
    }

    if (!relationship) {
      return {
        error: 'Veuillez indiquer votre qualité (mère, père, tuteur).',
        talentId,
      };
    }

    if (!city) {
      return { error: 'Veuillez indiquer la ville.', talentId };
    }

    const studentName = `${profile.prenom} ${profile.nom}`;

    // Records the decision + enqueues the matching PDF atomically, then fires
    // the (non-blocking) generation. The decided-at timestamp is set now, so
    // the `remaining` count below already excludes this child.
    await recordImageRightsDecision({
      talentId: profile.id,
      decision,
      signerPrenom,
      signerNom,
      relationship,
      city,
    });

    // Any child still awaiting a decision keeps the parent on this page.
    const remaining = await prisma.talent.count({
      where: {
        parentEmail: locals.user.email,
        imageRightsDecidedAt: null,
      },
    });

    if (remaining === 0) {
      throw redirect(303, resolve('/parent/merci'));
    }

    return { success: studentName, decision };
  },
};
