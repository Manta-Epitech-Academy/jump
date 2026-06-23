import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { renderNewsPost, type NewsPostContext } from '$lib/domain/newsPost';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorise');

  const talentCampusId = locals.talentCampusName
    ? ((
        await prisma.campus.findFirst({
          where: { name: locals.talentCampusName },
          select: { id: true },
        })
      )?.id ?? null)
    : null;

  const now = new Date();
  const posts = await prisma.newsPost.findMany({
    where: {
      AND: [
        { OR: [{ campusId: talentCampusId }, { campusId: null }] },
        { publishedAt: { lte: now } },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      publishedAt: true,
      author: {
        select: {
          user: { select: { name: true, image: true } },
        },
      },
      event: {
        select: {
          titre: true,
          campus: { select: { name: true, contactEmail: true } },
        },
      },
    },
  });

  const ctx: NewsPostContext = {
    prenom: locals.talent.prenom,
    nom: locals.talent.nom,
    campusName: locals.talentCampusName ?? '',
    campusContactEmail: null,
    stageName: null,
  };

  const rendered = posts.map((p) => ({
    id: p.id,
    title: p.title,
    content: renderNewsPost(p.content, {
      ...ctx,
      campusContactEmail: p.event?.campus?.contactEmail ?? null,
      stageName: p.event?.titre ?? null,
    }),
    publishedAt: p.publishedAt.toISOString(),
    authorName: p.author?.user?.name ?? 'Staff',
    authorImage: p.author?.user?.image ?? null,
  }));

  return { posts: rendered };
};
