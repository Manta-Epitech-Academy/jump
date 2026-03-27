import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { camperEmailSchema, camperOtpSchema } from '$lib/validation/auth';
import { ClientResponseError } from 'pocketbase';

export const load: PageServerLoad = async ({ locals }) => {
  // If already authenticated as a Student, route directly to the dashboard
  if (locals.studentPb?.authStore.isValid && locals.student) {
    throw redirect(303, resolve('/camper'));
  }

  const emailForm = await superValidate(zod4(camperEmailSchema));
  const otpForm = await superValidate(zod4(camperOtpSchema));

  return {
    emailForm,
    otpForm,
  };
};

export const actions: Actions = {
  requestOtp: async ({ request, locals }) => {
    const emailForm = await superValidate(request, zod4(camperEmailSchema));

    if (!emailForm.valid) {
      return fail(400, { emailForm });
    }

    try {
      // Normalize email to lowercase
      const normalizedEmail = emailForm.data.email.toLowerCase().trim();

      try {
        await locals.systemPb
          .collection('students')
          .getFirstListItem(`email="${normalizedEmail}"`, { fields: 'id' });
      } catch (err) {
        return message(
          emailForm,
          {
            type: 'error',
            text: 'Aucun profil trouvé avec cette adresse email.',
          },
          { status: 404 },
        );
      }

      // 2. L'utilisateur existe, nous pouvons demander l'OTP en toute sécurité
      const result = await locals.studentPb
        .collection('students')
        .requestOTP(normalizedEmail);

      // Pass the otpId back to the client via Superforms message
      return message(emailForm, {
        type: 'success',
        text: 'Code envoyé',
        otpId: result.otpId,
      });
    } catch (err) {
      console.error('OTP Request Error:', err);

      if (err instanceof ClientResponseError) {
        if (err.status === 429) {
          return message(
            emailForm,
            {
              type: 'error',
              text: 'Trop de tentatives. Veuillez patienter avant de réessayer.',
            },
            { status: 429 },
          );
        }
      }

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

  verifyOtp: async ({ request, locals }) => {
    const otpForm = await superValidate(request, zod4(camperOtpSchema));

    if (!otpForm.valid) {
      return fail(400, { otpForm });
    }

    try {
      // Authenticate the user securely using the OTP code
      await locals.studentPb
        .collection('students')
        .authWithOTP(otpForm.data.otpId, otpForm.data.password);
    } catch (err) {
      console.error('OTP Verify Error:', err);
      return message(
        otpForm,
        { type: 'error', text: 'Code secret incorrect ou expiré.' },
        { status: 400 },
      );
    }

    // The successful `authWithOTP` automatically modifies `locals.studentPb.authStore`.
    // The `hooks.server.ts` will serialize it securely into `pb_student_auth` on its way out.
    throw redirect(303, resolve('/camper'));
  },
};
