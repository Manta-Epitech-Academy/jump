import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { sanitizeWelcomeHtml } from '$lib/server/cms/sanitize';
import { defaultExpiresAt } from '$lib/domain/newsPost';

export const load: PageServerLoad = async () => {
  const [posts, campuses, events] = await Promise.all([
    prisma.newsPost.findMany({
      orderBy: { publishedAt: 'desc' },
      include: {
        campus: { select: { name: true } },
        author: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.event.findMany({
      take: 50,
      orderBy: { date: 'desc' },
      select: { id: true, titre: true, date: true, campusId: true },
    }),
  ]);

  return {
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      campusId: p.campusId,
      eventId: p.eventId,
      campusName: p.campus?.name ?? null,
      publishedAt: p.publishedAt.toISOString(),
      expiresAt: p.expiresAt?.toISOString() ?? null,
      authorName: p.author?.user?.name ?? 'Inconnu',
    })),
    campuses,
    events: events.map((e) => ({
      id: e.id,
      title: e.titre,
      campusId: e.campusId,
    })),
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const authorId = locals.staffProfile!.id;
    const formData = await request.formData();

    const title = formData.get('title');
    const rawContent = formData.get('content');
    const campusIdRaw = formData.get('campusId');

    if (typeof title !== 'string' || !title.trim()) {
      return fail(400, { error: 'Le titre est obligatoire.' });
    }
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return fail(400, { error: 'Le contenu est obligatoire.' });
    }

    const content = sanitizeWelcomeHtml(rawContent);
    const campusId =
      typeof campusIdRaw === 'string' && campusIdRaw ? campusIdRaw : null;
    const eventIdRaw = formData.get('eventId');
    const eventId =
      typeof eventIdRaw === 'string' && eventIdRaw ? eventIdRaw : null;

    const publishedAtRaw = formData.get('publishedAt');
    const expiresAtRaw = formData.get('expiresAt');

    const publishedAt =
      typeof publishedAtRaw === 'string' && publishedAtRaw
        ? new Date(publishedAtRaw)
        : new Date();
    const expiresAt =
      typeof expiresAtRaw === 'string' && expiresAtRaw
        ? new Date(expiresAtRaw)
        : defaultExpiresAt(publishedAt);

    await prisma.newsPost.create({
      data: {
        campusId,
        authorId,
        title: title.trim(),
        content,
        eventId,
        publishedAt,
        expiresAt,
      },
    });

    return { success: true };
  },

  update: async ({ request, locals }) => {
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

    const publishedAtRaw = formData.get('publishedAt');
    const expiresAtRaw = formData.get('expiresAt');

    const data: Record<string, unknown> = {
      title: title.trim(),
      content,
    };
    if (typeof publishedAtRaw === 'string' && publishedAtRaw) {
      data.publishedAt = new Date(publishedAtRaw);
    }
    if (typeof expiresAtRaw === 'string' && expiresAtRaw) {
      data.expiresAt = new Date(expiresAtRaw);
    }

    await prisma.newsPost.update({
      where: { id },
      data,
    });

    return { success: true };
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');

    if (typeof id !== 'string' || !id) {
      return fail(400, { error: 'Identifiant manquant.' });
    }

    await prisma.newsPost.deleteMany({ where: { id } });

    return { success: true };
  },
};
