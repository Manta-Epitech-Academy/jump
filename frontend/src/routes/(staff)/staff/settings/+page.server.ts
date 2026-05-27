import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message, setError } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import {
  staffDevRedirectSchema,
  splitDevRedirectEntries,
} from '$lib/validation/staffSettings';
import { devRedirectActive as emailTrapActive } from '$lib/server/email/dev-redirect';
import { devRedirectActive as smsTrapActive } from '$lib/server/sms/dev-redirect';
import { canArmRealSends } from '$lib/server/armRealSends';
import { toBrevoRecipient } from '$lib/domain/phone';
import { getStaffRoleRedirectPath } from '$lib/domain/staff';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const load: PageServerLoad = async ({ locals }) => {
  const staff = locals.staffProfile;
  if (!staff) throw redirect(303, '/staff/login');

  const form = await superValidate(
    {
      devRedirectEmails: staff.devRedirectEmails.join('\n'),
      devRedirectPhones: staff.devRedirectPhones.join('\n'),
    },
    zod4(staffDevRedirectSchema),
  );

  return {
    form,
    // The dev banner only matters where outbound is trapped. We still let staff
    // edit their lists in prod (harmless, inert), but explain they do nothing.
    emailTrapActive: emailTrapActive(),
    smsTrapActive: smsTrapActive(),
    // "Real sends" arming: who may, and the current state (mirrors locals so the
    // section reflects an arm/disarm done from the global banner too).
    canArmRealSends: canArmRealSends(locals),
    armedRealSends: locals.armedRealSends,
    armedRealSendsUntil: locals.armedRealSendsUntil,
    backPath: getStaffRoleRedirectPath(staff.staffRole) ?? '/staff/login',
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const staff = locals.staffProfile;
    if (!staff) throw redirect(303, '/staff/login');

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
