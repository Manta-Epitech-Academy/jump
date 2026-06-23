import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { sanitizeWelcomeHtml } from '$lib/server/cms/sanitize';
import { defaultExpiresAt } from '$lib/domain/newsPost';

export const load: PageServerLoad = async ({ locals }) => {
  requireFlag(locals, 'news_feed');
  requireStaffGroup(locals, 'devMember');

  const campusId = getCampusId(locals);

  const [posts, events] = await Promise.all([
    prisma.newsPost.findMany({
      where: { campusId },
      orderBy: { publishedAt: 'desc' },
      include: { author: { select: { user: { select: { name: true } } } } },
    }),
    prisma.event.findMany({
      where: { campusId },
      take: 20,
      orderBy: { date: 'desc' },
      select: { id: true, titre: true, date: true },
    }),
  ]);

  return {
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      eventId: p.eventId,
      publishedAt: p.publishedAt.toISOString(),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      authorName: p.author?.user?.name ?? 'Inconnu',
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.titre,
      date: e.date.toISOString(),
    })),
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireFlag(locals, 'news_feed');
    requireStaffGroup(locals, 'devMember');

    const campusId = getCampusId(locals);
    const authorId = locals.staffProfile!.id;
    const formData = await request.formData();

    const title = formData.get('title');
    const rawContent = formData.get('content');
    const eventId = formData.get('eventId') || null;

    if (typeof title !== 'string' || !title.trim()) {
      return fail(400, { error: 'Le titre est obligatoire.' });
    }
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return fail(400, { error: 'Le contenu est obligatoire.' });
    }

    const content = sanitizeWelcomeHtml(rawContent);

    await prisma.newsPost.create({
      data: {
        campusId,
        authorId,
        title: title.trim(),
        content,
        eventId: typeof eventId === 'string' && eventId ? eventId : null,
        expiresAt: defaultExpiresAt(),
      },
    });

    return { success: true };
  },

  update: async ({ request, locals }) => {
    requireFlag(locals, 'news_feed');
    requireStaffGroup(locals, 'devMember');

    const campusId = getCampusId(locals);
    const formData = await request.formData();

    const id = formData.get('id');
    const title = formData.get('title');
    const rawContent = formData.get('content');

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Identifiant manquant.' });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return fail(400, { error: 'Le titre est obligatoire.' });
    }
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return fail(400, { error: 'Le contenu est obligatoire.' });
    }

    const content = sanitizeWelcomeHtml(rawContent);

    await prisma.newsPost.updateMany({
      where: { id, campusId },
      data: { title: title.trim(), content },
    });

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    requireFlag(locals, 'news_feed');
    requireStaffGroup(locals, 'devMember');

    const campusId = getCampusId(locals);
    const formData = await request.formData();
    const id = formData.get('id');

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Identifiant manquant.' });
    }

    await prisma.newsPost.deleteMany({
      where: { id, campusId },
    });

    return { success: true };
  },
};
