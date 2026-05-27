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

  // Children whose guardian has not yet decided either way — a refusal is a
  // settled decision and drops out here just as an authorization does.
  const undecidedChildren = await prisma.talent.findMany({
    where: {
      parentEmail: locals.user.email,
      imageRightsDecidedAt: null,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
    },
  });

  if (undecidedChildren.length === 0) {
    throw redirect(303, resolve('/parent/merci'));
  }

  return {
    parentName: locals.user.name,
    children: undecidedChildren,
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
    const signerName = (formData.get('signerName') as string)?.trim();
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

    if (!signerName || signerName.length < 2) {
      return { error: 'Veuillez entrer votre nom complet.', talentId };
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
      studentName,
      decision,
      signerName,
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
