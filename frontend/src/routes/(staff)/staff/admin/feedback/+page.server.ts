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

  // Group events by eventType for the UI
  const groupMap = new Map<
    string,
    {
      eventType: string;
      totalSubmissions: number;
      totalParticipants: number;
      events: {
        id: string;
        titre: string;
        date: Date;
        campusName: string;
        submissions: number;
        participants: number;
      }[];
    }
  >();

  for (const e of events) {
    let group = groupMap.get(e.eventType);
    if (!group) {
      group = {
        eventType: e.eventType,
        totalSubmissions: 0,
        totalParticipants: 0,
        events: [],
      };
      groupMap.set(e.eventType, group);
    }
    group.totalSubmissions += e._count.feedbackSubmissions;
    group.totalParticipants += e._count.participations;
    group.events.push({
      id: e.id,
      titre: e.titre,
      date: e.date,
      campusName: e.campus.name,
      submissions: e._count.feedbackSubmissions,
      participants: e._count.participations,
    });
  }

  return {
    groups: [...groupMap.values()],
  };
};
