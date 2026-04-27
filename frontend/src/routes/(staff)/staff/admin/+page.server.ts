import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { getLastSync } from '$lib/server/infra/syncStatus';

export const load: PageServerLoad = async () => {
  // Retrieve global statistics
  const [
    campusCount,
    userCount,
    studentCount,
    eventCount,
    recentEvents,
    lastSync,
  ] = await Promise.all([
    prisma.campus.count(),
    prisma.bauth_user.count(),
    prisma.talent.count(),
    prisma.event.count(),
    prisma.event.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { campus: true },
    }),
    getLastSync(),
  ]);

  return {
    stats: {
      campuses: campusCount,
      users: userCount,
      students: studentCount,
      events: eventCount,
    },
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      titre: e.titre,
      date: e.date,
      campus: e.campus?.name || 'Inconnu',
    })),
    lastSync,
  };
};
