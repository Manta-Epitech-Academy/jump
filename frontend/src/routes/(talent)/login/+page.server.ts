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
import { ensureTalentUser } from '$lib/server/services/talentAccount';
import {
  captureRedirectCookie,
  consumeRedirectCookie,
} from '$lib/server/auth/loginRedirect';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (locals.talent) {
    throw redirect(303, resolve('/'));
  }
  if (locals.user?.role === 'parent') {
    throw redirect(303, resolve('/parent/welcome'));
  }

  // Stash where the guard bounced them from, to replay after OTP verifies.
  captureRedirectCookie(url, cookies, 'talent');

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
      // Route by the login identity (bauth_user) — the single source of truth.
      // Every talent has an account from import (eager mint); a talent whose
      // mint hit a conflict has no account and correctly can't sign in until an
      // admin resolves it.
      const user = await prisma.bauth_user.findUnique({
        where: { email: normalizedEmail },
        select: { role: true, talent: { select: { id: true } } },
      });

      let userKind: 'talent' | 'parent' = 'talent';

      if (user?.talent) {
        const userId = await ensureTalentUser(user.talent.id);
        // ensureTalentUser may have just realigned the login email to SF's
        // current claim — meaning the address the student typed is one SF has
        // disowned. BetterAuth's OTP send silently succeeds for an email that
        // matches no account (anti-enumeration + disableSignUp), so without
        // this re-check the student would see "Code envoyé" and never receive
        // a code. Answer what the next sync pass would have made true anyway:
        // no account under that address.
        const account = await prisma.bauth_user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (account && account.email.toLowerCase().trim() !== normalizedEmail) {
          return message(
            emailForm,
            {
              type: 'error',
              text: 'Aucun compte trouvé avec cette adresse email.',
            },
            { status: 404 },
          );
        }
      } else if (user?.role === 'parent') {
        userKind = 'parent';
      } else {
        return message(
          emailForm,
          {
            type: 'error',
            text: 'Aucun compte trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });

      await recordAttempt('request', normalizedEmail);

      return message(emailForm, {
        type: 'success',
        text: 'Code envoyé',
        email: normalizedEmail,
        userKind,
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
      console.error('[verifyOtp] OTP Verify Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code secret incorrect ou expiré.' },
        { status: 400 },
      );
    }

    // Read + clear the "return to" target captured when the guard bounced them
    // to login (talents only; parents have their own destinations below).
    const back = consumeRedirectCookie(cookies, 'talent');

    // Route to the right space based on the user's role
    const user = await prisma.bauth_user.findUnique({
      where: { email: normalizedEmail },
      select: { role: true },
    });

    if (user?.role === 'parent') {
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
    }

    throw redirect(303, back ?? resolve('/'));
  },
};
