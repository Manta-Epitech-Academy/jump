import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from '$lib/server/auth/cookies';
import { sendOtpEmail } from '$lib/server/otp';
import { consumeParentOtp } from '$lib/server/services/parentTokens';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role === 'parent') {
    throw redirect(303, resolve('/parent'));
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

    try {
      const normalizedEmail = emailForm.data.email.toLowerCase().trim();

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

      // Generate OTP via BetterAuth (hook stores it in parentToken for all parents)
      await auth.api.sendVerificationOTP({
        body: { email: normalizedEmail, type: 'sign-in' },
      });

      // Consume OTP from parentToken and send email directly
      const otp = await consumeParentOtp(normalizedEmail);
      if (otp) {
        await sendOtpEmail(normalizedEmail, otp, user.name ?? undefined);
      }

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

    try {
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
      console.error('[parent verifyOtp] Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code incorrect ou expiré.' },
        { status: 400 },
      );
    }

    throw redirect(303, resolve('/parent'));
  },
};
