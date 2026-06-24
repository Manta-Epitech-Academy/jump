import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { renderNewsPost, type NewsPostContext } from '$lib/domain/newsPost';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorise');

  const talentId = locals.talent.id;

  const talentCampusId = locals.talentCampusName
    ? ((
        await prisma.campus.findFirst({
          where: { name: locals.talentCampusName },
          select: { id: true },
        })
      )?.id ?? null)
    : null;

  const now = new Date();

  const postSelect = {
    id: true,
    title: true,
    content: true,
    publishedAt: true,
    eventId: true,
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
  } as const;

  const baseWhere = {
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  // Posts without event: campus filter only
  // Posts with event: campus filter + talent must have a Participation for that event
  const talentEventIds = await prisma.participation.findMany({
    where: { talentId },
    select: { eventId: true },
    distinct: ['eventId'],
  });
  const eventIdSet = new Set(talentEventIds.map((p) => p.eventId));

  const posts = await prisma.newsPost.findMany({
    where: {
      AND: [
        { OR: [{ campusId: talentCampusId }, { campusId: null }] },
        baseWhere,
        {
          OR: [
            { eventId: null },
            ...(eventIdSet.size > 0
              ? [{ eventId: { in: [...eventIdSet] } }]
              : []),
          ],
        },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: postSelect,
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
