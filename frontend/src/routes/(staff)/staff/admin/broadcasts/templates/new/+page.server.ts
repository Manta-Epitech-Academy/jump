import type { Actions, PageServerLoad } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { messageTemplateSchema } from '$lib/validation/broadcasts';
import { isSmsEnabled } from '$lib/server/sms';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

export const load: PageServerLoad = async ({ locals }) => {
  const form = await superValidate(zod4(messageTemplateSchema), {
    errors: false,
  });
  return {
    form,
    smsEnabled: isSmsEnabled(),
    userEmail: locals.user?.email ?? '',
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_TEMPLATE_SAVE, { locals });
    const form = await superValidate(request, zod4(messageTemplateSchema));
    if (!form.valid) return fail(400, { form });
    if (!locals.user) return fail(401, { form });

    const created = await prisma.messageTemplate.create({
      data: {
        name: form.data.name,
        channel: form.data.channel,
        subject: form.data.subject || null,
        body: form.data.body,
        createdById: locals.user.id,
      },
      select: { id: true },
    });

    redirect(303, `/staff/admin/broadcasts/templates/${created.id}`);
  },
};
