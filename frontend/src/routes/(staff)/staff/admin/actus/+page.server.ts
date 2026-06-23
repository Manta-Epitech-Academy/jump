import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { sanitizeWelcomeHtml } from '$lib/server/cms/sanitize';
import { defaultExpiresAt } from '$lib/domain/newsPost';

export const load: PageServerLoad = async () => {
  const [posts, campuses] = await Promise.all([
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
  ]);

  return {
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      campusId: p.campusId,
      campusName: p.campus?.name ?? null,
      publishedAt: p.publishedAt.toISOString(),
      authorName: p.author?.user?.name ?? 'Inconnu',
    })),
    campuses,
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

    await prisma.newsPost.create({
      data: {
        campusId,
        authorId,
        title: title.trim(),
        content,
        expiresAt: defaultExpiresAt(),
      },
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
