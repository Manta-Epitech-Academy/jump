import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message, setError } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import {
  staffDevRedirectSchema,
  splitDevRedirectEntries,
} from '$lib/validation/staffSettings';
import { toBrevoRecipient } from '$lib/domain/phone';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// This route is action-only: the settings UI is a dialog rendered by the admin
// layout (the dev-redirect controls are admin-only). A direct GET has no page
// to render, so bounce it to the admin space.
export const load: PageServerLoad = async () => {
  throw redirect(303, '/staff/admin');
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const staff = locals.staffProfile;
    if (!staff) throw redirect(303, '/staff/login');
    // Dev-redirect lists are an admin-only control; non-admins have no way to
    // reach this dialog, but guard the action too so the route can't be posted
    // to directly.
    if (staff.staffRole !== 'admin') throw error(403, 'Action réservée.');

    const form = await superValidate(request, zod4(staffDevRedirectSchema));
    if (!form.valid) return fail(400, { form });

    // Emails: lowercase + dedupe; reject anything that isn't address-shaped.
    const emails = splitDevRedirectEntries(form.data.devRedirectEmails).map(
      (e) => e.toLowerCase(),
    );
    const badEmails = emails.filter((e) => !EMAIL_RE.test(e));
    if (badEmails.length > 0) {
      return setError(
        form,
        'devRedirectEmails',
        `Adresses invalides : ${badEmails.join(', ')}`,
      );
    }

    // Phones: normalize to Brevo's format (also the validity check) + dedupe.
    // Store normalized so the SMS façade ships exactly what was validated.
    const rawPhones = splitDevRedirectEntries(form.data.devRedirectPhones);
    const badPhones = rawPhones.filter((p) => !toBrevoRecipient(p));
    if (badPhones.length > 0) {
      return setError(
        form,
        'devRedirectPhones',
        `Numéros invalides : ${badPhones.join(', ')}`,
      );
    }
    const phones = rawPhones.map((p) => toBrevoRecipient(p)!);

    await prisma.staffProfile.update({
      where: { id: staff.id },
      data: {
        devRedirectEmails: [...new Set(emails)],
        devRedirectPhones: [...new Set(phones)],
      },
    });

    return message(form, {
      type: 'success' as const,
      text: 'Préférences enregistrées.',
    });
  },
};
