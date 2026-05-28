import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import {
  checkRateLimit,
  recordFailedAttempt,
} from '$lib/server/auth/rateLimiter';
import { prisma } from '$lib/server/db';
import { ensureTalentUser } from '$lib/server/services/talentAccount';

export const load: PageServerLoad = async ({ locals, url }) => {
  // If already authenticated as a Student, route directly to the dashboard
  if (locals.talent) {
    throw redirect(303, resolve('/'));
  }

  // Handle errors returned from the OAuth callback
  const errorType = url.searchParams.get('error');
  let errorMessage = '';

  if (errorType === 'UnauthorizedDomain') {
    errorMessage = 'Accès refusé. Veuillez utiliser une adresse @epitech.eu.';
  } else if (errorType === 'OAuthFailed') {
    errorMessage = "Échec de l'authentification Microsoft.";
  } else if (errorType === 'OAuthStateMismatch') {
    errorMessage = 'Erreur de sécurité (State Mismatch). Veuillez réessayer.';
  } else if (errorType === 'ProviderMissing') {
    errorMessage =
      "Le fournisseur d'authentification Microsoft n'est pas configuré.";
  } else if (errorType === 'StudentNotFound') {
    errorMessage =
      "Aucun profil Talent trouvé pour cette adresse email. Contactez l'administration.";
  }

  const emailForm = await superValidate(zod4(camperEmailSchema));
  const otpForm = await superValidate(zod4(camperOtpSchema));

  return {
    emailForm,
    otpForm,
    errorMessage,
  };
};

export const actions: Actions = {
  requestOtp: async ({ request }) => {
    const emailForm = await superValidate(request, zod4(camperEmailSchema));

    if (!emailForm.valid) {
      return fail(400, { emailForm });
    }

    try {
      const normalizedEmail = emailForm.data.email.toLowerCase().trim();

      // A talent profile must exist for this email (linked or seeded). Without
      // one there's nothing to sign in to.
      const talent = await prisma.talent.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (!talent) {
        return message(
          emailForm,
          {
            type: 'error',
            text: 'Aucun profil trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      // Bootstrap / link the bauth_user for seeded profiles that never logged in.
      await ensureTalentUser(talent.id);

      // Send OTP via BetterAuth emailOTP plugin
      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });

      return message(emailForm, {
        type: 'success',
        text: 'Code envoyé',
        email: normalizedEmail,
      });
    } catch (err) {
      console.error('OTP Request Error:', err);

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

  verifyOtp: async ({ request, cookies, getClientAddress }) => {
    const otpForm = await superValidate(request, zod4(camperOtpSchema));

    if (!otpForm.valid) {
      return fail(400, { otpForm });
    }

    const ip = getClientAddress();
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return message(
        otpForm,
        {
          type: 'error',
          text: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfterSeconds} secondes.`,
        },
        { status: 429 },
      );
    }

    try {
      // Sign in via BetterAuth emailOTP plugin as a Response object
      const authResponse = await auth.api.signInEmailOTP({
        body: {
          email: otpForm.data.email,
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
      recordFailedAttempt(ip);
      console.error('[verifyOtp] OTP Verify Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code secret incorrect ou expiré.' },
        { status: 400 },
      );
    }

    throw redirect(303, resolve('/'));
  },
};
