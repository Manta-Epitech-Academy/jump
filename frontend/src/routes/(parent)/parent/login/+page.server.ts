import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { checkRateLimit, recordAttempt } from '$lib/server/auth/rateLimiter';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role === 'parent') {
    // Canonical flow entry; the guard re-routes to welcome/merci as needed.
    throw redirect(303, resolve('/parent/welcome'));
  }

  const emailForm = await superValidate(zod4(camperEmailSchema));
  const otpForm = await superValidate(zod4(camperOtpSchema));

  return { emailForm, otpForm };
};

export const actions: Actions = {
  requestOtp: async ({ request }) => {
    const emailForm = await superValidate(request, zod4(camperEmailSchema));

    if (!emailForm.valid) {
      return fail(400, { emailForm });
    }

    const normalizedEmail = emailForm.data.email.toLowerCase().trim();

    const requestLimit = await checkRateLimit('request', normalizedEmail);
    if (!requestLimit.allowed) {
      return message(
        emailForm,
        {
          type: 'error',
          text: `Trop de demandes. Réessayez dans ${requestLimit.retryAfterSeconds} secondes.`,
        },
        { status: 429 },
      );
    }

    try {
      const user = await prisma.bauth_user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user || user.role !== 'parent') {
        return message(
          emailForm,
          {
            type: 'error',
            text: 'Aucun compte parent trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      // BetterAuth generates OTP and sends email directly via hook
      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });

      // Only count a real send: a lookup-404 or provider error costs nothing
      // and shouldn't burn budget for the legitimate parent behind the typo.
      await recordAttempt('request', normalizedEmail);

      return message(emailForm, {
        type: 'success',
        text: 'Code envoyé',
        email: normalizedEmail,
      });
    } catch (err) {
      console.error('Parent OTP Request Error:', err);
      return message(
        emailForm,
        {
          type: 'error',
          text: "Impossible d'envoyer le code. Réessayez plus tard.",
        },
        { status: 500 },
      );
    }
  },

  verifyOtp: async ({ request, cookies }) => {
    const otpForm = await superValidate(request, zod4(camperOtpSchema));

    if (!otpForm.valid) {
      return fail(400, { otpForm });
    }

    const normalizedEmail = otpForm.data.email.toLowerCase().trim();

    const verifyLimit = await checkRateLimit('verify', normalizedEmail);
    if (!verifyLimit.allowed) {
      return message(
        otpForm,
        {
          type: 'error',
          text: `Trop de tentatives. Réessayez dans ${verifyLimit.retryAfterSeconds} secondes.`,
        },
        { status: 429 },
      );
    }

    try {
      const authResponse = await auth.api.signInEmailOTP({
        body: {
          email: normalizedEmail,
          otp: otpForm.data.password,
        },
        asResponse: true,
        headers: request.headers,
      });

      if (!authResponse.ok) {
        throw new Error('Invalid OTP');
      }

      forwardAuthCookies(authResponse, cookies);
    } catch (err) {
      await recordAttempt('verify', normalizedEmail);
      console.error('[parent verifyOtp] Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code incorrect ou expiré.' },
        { status: 400 },
      );
    }

    // Route into the flow if any child still has something pending — the
    // règlement intérieur to co-sign or an image-rights decision to make.
    const pendingCount = await prisma.talent.count({
      where: {
        parentEmail: normalizedEmail,
        OR: [{ parentRulesSignedAt: null }, { imageRightsDecidedAt: null }],
      },
    });

    if (pendingCount > 0) {
      throw redirect(303, resolve('/parent/welcome'));
    }

    throw redirect(303, resolve('/parent/merci'));
  },
};
