import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { claimAttempt } from '$lib/server/auth/rateLimiter';
import { prisma } from '$lib/server/db';
import { resolveOtpIdentity } from '$lib/server/auth/otpAudience';
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

  const emailForm = await superValidate(zod4(camperEmailSchema));
  const otpForm = await superValidate(zod4(camperOtpSchema));

  return {
    emailForm,
    otpForm,
  };
};

export const actions: Actions = {
  requestOtp: async ({ request }) => {
    const emailForm = await superValidate(request, zod4(camperEmailSchema));

    if (!emailForm.valid) {
      return fail(400, { emailForm });
    }

    const normalizedEmail = emailForm.data.email.toLowerCase().trim();

    const claim = await claimAttempt('request', normalizedEmail);
    if (!claim.allowed) {
      return message(
        emailForm,
        {
          type: 'error',
          text: `Trop de demandes. Réessayez dans ${claim.retryAfterSeconds} secondes.`,
        },
        { status: 429 },
      );
    }

    // Only a sent code counts against the address; every other way out of
    // the `try` gives the claim back.
    let sent = false;
    try {
      // Route by the login identity (bauth_user): the single source of truth.
      // Every talent has an account from import (eager mint); a talent whose
      // mint hit a conflict has no account and correctly can't sign in until an
      // admin resolves it. `resolveOtpIdentity` is the same function
      // `emailOtpAudienceGate` refuses on, so this page and the BetterAuth
      // routes underneath it cannot disagree about who may use this door - the
      // gap between the two is what left staff accounts reachable by OTP.
      const identity = await resolveOtpIdentity(normalizedEmail);

      if (!identity) {
        return message(
          emailForm,
          {
            type: 'error',
            text: 'Aucun compte trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      const userKind = identity.audience;

      if (identity.audience === 'talent') {
        const userId = await ensureTalentUser(identity.talentId);
        // ensureTalentUser may have just realigned the login email to SF's
        // current claim, meaning the address the student typed is one SF has
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
      }

      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });
      sent = true;

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
    } finally {
      if (!sent) await claim.release();
    }
  },

  verifyOtp: async ({ request, cookies }) => {
    const otpForm = await superValidate(request, zod4(camperOtpSchema));

    if (!otpForm.valid) {
      return fail(400, { otpForm });
    }

    const normalizedEmail = otpForm.data.email.toLowerCase().trim();

    const claim = await claimAttempt('verify', normalizedEmail);
    if (!claim.allowed) {
      return message(
        otpForm,
        {
          type: 'error',
          text: `Trop de tentatives. Réessayez dans ${claim.retryAfterSeconds} secondes.`,
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
      // The claim stands: a failed verify is what this bucket counts.
      console.error('[verifyOtp] OTP Verify Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code secret incorrect ou expiré.' },
        { status: 400 },
      );
    }

    // A clean sign-in costs the address nothing.
    await claim.release();

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
