import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const unsignedChildren = await prisma.talent.findMany({
    where: {
      parentEmail: locals.user.email,
      imageRightsSignedAt: null,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
    },
  });

  if (unsignedChildren.length === 0) {
    throw redirect(303, resolve('/parent'));
  }

  return {
    parentName: locals.user.name,
    children: unsignedChildren,
  };
};

export const actions: Actions = {
  sign: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'parent') {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const talentId = (formData.get('talentId') as string)?.trim();
    const signerName = (formData.get('signerName') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const accepted = formData.get('accepted');

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

    if (!accepted) {
      return {
        error: "Vous devez cocher l'autorisation pour signer.",
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

    const now = new Date();
    const storage = getStorage();
    const studentName = `${profile.prenom} ${profile.nom}`;

    const pdf = await generateOnboardingPDF({
      type: 'image-rights',
      studentName,
      signerName,
      relationship,
      city,
      signedAt: now,
    });

    const key = `documents/${profile.id}/image-rights-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.talent.update({
      where: { id: profile.id },
      data: {
        imageRightsSignedAt: now,
        imageRightsSignerName: signerName,
        imageRightsFilePath: key,
      },
    });

    // Check if more children need signing
    const remaining = await prisma.talent.count({
      where: {
        parentEmail: locals.user.email,
        imageRightsSignedAt: null,
      },
    });

    if (remaining === 0) {
      throw redirect(303, resolve('/parent'));
    }

    // Stay on page for remaining children
    return { success: studentName };
  },
};
