import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { messageTemplateSchema } from '$lib/validation/broadcasts';
import { isSmsEnabled } from '$lib/server/sms';

export const load: PageServerLoad = async ({ params, locals }) => {
  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      channel: true,
      subject: true,
      body: true,
      _count: { select: { broadcasts: true } },
    },
  });
  if (!template) error(404, 'Template introuvable');

  const form = await superValidate(
    {
      name: template.name,
      channel: template.channel,
      subject: template.subject ?? '',
      body: template.body,
    },
    zod4(messageTemplateSchema),
  );

  return {
    template,
    form,
    smsEnabled: isSmsEnabled(),
    userEmail: locals.user?.email ?? '',
  };
};

export const actions: Actions = {
  update: async ({ request, params }) => {
    const form = await superValidate(request, zod4(messageTemplateSchema));
    if (!form.valid) return fail(400, { form });

    await prisma.messageTemplate.update({
      where: { id: params.id },
      data: {
        name: form.data.name,
        channel: form.data.channel,
        subject: form.data.subject || null,
        body: form.data.body,
      },
    });

    return { form, success: true };
  },
};
