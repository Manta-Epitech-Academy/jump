import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      channel: true,
      subject: true,
      updatedAt: true,
      _count: { select: { broadcasts: true } },
    },
  });
  return { templates };
};

export const actions: Actions = {
  duplicate: async ({ request, locals }) => {
    if (!locals.user) return fail(401);
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const source = await prisma.messageTemplate.findUnique({
      where: { id },
      select: { name: true, channel: true, subject: true, body: true },
    });
    if (!source) return fail(404);

    const copy = await prisma.messageTemplate.create({
      data: {
        name: `${source.name} (copie)`,
        channel: source.channel,
        subject: source.subject,
        body: source.body,
        createdById: locals.user.id,
      },
      select: { id: true },
    });
    // Jump straight into the duplicate's edit page so the admin can rename
    // before saving anything else.
    redirect(303, `/staff/admin/broadcasts/templates/${copy.id}`);
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const used = await prisma.broadcast.count({ where: { templateId: id } });
    if (used > 0) {
      return fail(400, {
        deleteError: `Impossible : ${used} envoi(s) utilisent ce template.`,
      });
    }
    await prisma.messageTemplate.delete({ where: { id } });
    return { success: true };
  },
};
