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
    // "Membres de l'équipe" = staff only. bauth_user also holds students and
    // parents (every OTP login mints one), so an unfiltered count inflated this
    // far past the staff list it links to. Match /staff/admin/users exactly.
    prisma.bauth_user.count({ where: { staffProfile: { isNot: null } } }),
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
