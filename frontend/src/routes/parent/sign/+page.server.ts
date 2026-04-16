import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { auth } from '$lib/server/auth';
import { generateOnboardingPDF } from '$lib/server/services/onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
  const talentId = url.searchParams.get('student');
  if (!talentId) {
    throw error(400, 'Paramètre student manquant.');
  }

  const profile = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentEmail: true,
      imageRightsSignedAt: true,
      imageRightsSignerName: true,
    },
  });

  if (!profile) {
    throw error(404, 'Profil étudiant introuvable.');
  }

  // Already signed — show thank you page directly
  if (profile.imageRightsSignedAt) {
    return {
      step: 'done' as const,
      studentName: `${profile.prenom} ${profile.nom}`,
      talentId,
    };
  }

  return {
    step: 'otp' as const,
    studentName: `${profile.prenom} ${profile.nom}`,
    talentId,
    parentEmail: profile.parentEmail,
  };
};

export const actions: Actions = {
  verifyOtp: async ({ request, url }) => {
    const formData = await request.formData();
    const otp = (formData.get('otp') as string)?.trim();
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const talentId = url.searchParams.get('student') || (formData.get('talentId') as string);

    if (!otp || otp.length !== 6) {
      return { step: 'otp' as const, error: 'Veuillez entrer un code à 6 chiffres.', talentId };
    }

    if (!email) {
      return { step: 'otp' as const, error: 'Email manquant.', talentId };
    }

    // Verify OTP via BetterAuth (without creating a persistent session)
    try {
      const response = await auth.api.signInEmailOTP({
        body: { email, otp },
        asResponse: true,
        headers: request.headers,
      });

      if (!response.ok) {
        return { step: 'otp' as const, error: 'Code incorrect ou expiré.', talentId };
      }
    } catch {
      return { step: 'otp' as const, error: 'Code incorrect ou expiré.', talentId };
    }

    // Verify this email matches the student's parent email
    const profile = await prisma.talent.findUnique({
      where: { id: talentId! },
      select: { parentEmail: true, prenom: true, nom: true, imageRightsSignedAt: true },
    });

    if (!profile || profile.parentEmail?.toLowerCase() !== email) {
      return { step: 'otp' as const, error: 'Ce code ne correspond pas au parent de cet élève.', talentId };
    }

    if (profile.imageRightsSignedAt) {
      return {
        step: 'done' as const,
        studentName: `${profile.prenom} ${profile.nom}`,
        talentId,
      };
    }

    return {
      step: 'sign' as const,
      studentName: `${profile.prenom} ${profile.nom}`,
      talentId,
      email,
    };
  },

  sign: async ({ request, url }) => {
    const formData = await request.formData();
    const signerName = (formData.get('signerName') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const talentId = url.searchParams.get('student') || (formData.get('talentId') as string);

    if (!signerName || signerName.length < 2) {
      return {
        step: 'sign' as const,
        error: 'Veuillez entrer votre nom complet.',
        talentId,
      };
    }

    if (!relationship) {
      return {
        step: 'sign' as const,
        error: 'Veuillez indiquer votre qualité (mère, père, tuteur).',
        talentId,
      };
    }

    if (!city) {
      return {
        step: 'sign' as const,
        error: 'Veuillez indiquer la ville.',
        talentId,
      };
    }

    const profile = await prisma.talent.findUnique({
      where: { id: talentId! },
      select: { id: true, prenom: true, nom: true },
    });

    if (!profile) {
      throw error(404, 'Profil étudiant introuvable.');
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

    return {
      step: 'done' as const,
      studentName,
      talentId,
    };
  },

  resendOtp: async ({ request, url }) => {
    const formData = await request.formData();
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const talentId = url.searchParams.get('student') || (formData.get('talentId') as string);

    if (!email || !talentId) {
      return { step: 'otp' as const, error: 'Email manquant.', talentId };
    }

    try {
      const profile = await prisma.talent.findUnique({
        where: { id: talentId },
        select: { prenom: true, nom: true },
      });

      // sendVerificationOTP stores the OTP in pendingParentOtps (parent role skips email)
      await auth.api.sendVerificationOTP({
        body: { email, type: 'sign-in' },
      });

      // Send single combined email with link + OTP
      await sendParentSignatureEmail(
        email,
        talentId,
        profile ? `${profile.prenom} ${profile.nom}` : '',
      );
    } catch (err) {
      console.error('Failed to resend OTP:', err);
    }

    return {
      step: 'otp' as const,
      resent: true,
      talentId,
    };
  },
};
