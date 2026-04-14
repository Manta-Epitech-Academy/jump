import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
  verifyParentCode,
  markCodeUsed,
} from '$lib/server/services/parentCodeService';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  verify: async ({ request }) => {
    const formData = await request.formData();
    const code = (formData.get('code') as string)?.trim().toUpperCase();

    if (!code || code.length !== 6) {
      return { step: 'code' as const, error: 'Veuillez entrer un code à 6 caractères.' };
    }

    const record = await verifyParentCode(code);

    if (!record) {
      return { step: 'code' as const, error: 'Code invalide, expiré ou déjà utilisé.' };
    }

    return {
      step: 'sign' as const,
      code,
      studentName: `${record.studentProfile.prenom} ${record.studentProfile.nom}`,
    };
  },

  sign: async ({ request }) => {
    const formData = await request.formData();
    const code = (formData.get('code') as string)?.trim().toUpperCase();
    const signerName = (formData.get('signerName') as string)?.trim();

    if (!signerName || signerName.length < 2) {
      return {
        step: 'sign' as const,
        code,
        error: 'Veuillez entrer votre nom complet.',
      };
    }

    const record = await verifyParentCode(code);

    if (!record) {
      return { step: 'code' as const, error: 'Code invalide, expiré ou déjà utilisé.' };
    }

    const now = new Date();
    const storage = getStorage();
    const studentProfile = record.studentProfile;

    const pdf = await generateOnboardingPDF({
      type: 'image-rights',
      studentName: `${studentProfile.prenom} ${studentProfile.nom}`,
      signerName,
      signedAt: now,
    });

    const key = `documents/${studentProfile.id}/image-rights-${now.getTime()}.pdf`;
    await storage.save(key, pdf);

    await prisma.studentProfile.update({
      where: { id: studentProfile.id },
      data: {
        imageRightsSignedAt: now,
        imageRightsSignerName: signerName,
        imageRightsFilePath: key,
      },
    });

    await markCodeUsed(record.id);

    return { step: 'done' as const };
  },
};
