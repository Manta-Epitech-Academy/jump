import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const events = await prisma.event.findMany({
    where: {
      feedbackSubmissions: { some: {} },
    },
    select: {
      id: true,
      titre: true,
      eventType: true,
      date: true,
      campus: { select: { name: true } },
      _count: { select: { feedbackSubmissions: true, participations: true } },
    },
    orderBy: { date: 'desc' },
  });

  return {
    events: events.map((e) => ({
      id: e.id,
      titre: e.titre,
      eventType: e.eventType,
      date: e.date,
      campusName: e.campus.name,
      submissions: e._count.feedbackSubmissions,
      participants: e._count.participations,
    })),
  };
};
