import type { PageServerLoad } from './$types';
import {
  scopedPrisma,
  getCampusId,
  getCampusTimezone,
} from '$lib/server/db/scoped';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
  if (!locals.user) {
    throw error(401, 'Non autorisé');
  }

  const { workspace } = await parent();
  const db = scopedPrisma(getCampusId(locals));

  // Get the selected year from query parameters, defaulting to the current/default event's school year
  const defaultYear = workspace.current?.schoolYear.label ?? '';
  const selectedYear = url.searchParams.get('year') || defaultYear;

  // Filter workspace events that belong to the selected year
  const yearEvents = workspace.events.filter(
    (e) => e.schoolYear.label === selectedYear,
  );
  const eventIds = yearEvents.map((e) => e.id);

  let stats = {
    totalEvents: yearEvents.length,
    totalParticipants: 0,
    presenceRate: 0,
    totalInterviews: 0,
    eventBreakdown: [] as any[],
  };

  if (eventIds.length > 0) {
    // Fetch counts in parallel
    const [participationsCount, presences, interviews] = await Promise.all([
      db.participation.count({
        where: { eventId: { in: eventIds } },
      }),
      db.eventPresence.findMany({
        where: { eventId: { in: eventIds } },
        select: { status: true },
      }),
      db.interview.count({
        where: { participation: { eventId: { in: eventIds } } },
      }),
    ]);

    stats.totalParticipants = participationsCount;
    stats.totalInterviews = interviews;

    // Calculate presence rate (present + late / total presences registered)
    if (presences.length > 0) {
      const presentCount = presences.filter(
        (p) => p.status === 'present' || p.status === 'late',
      ).length;
      stats.presenceRate = Math.round((presentCount / presences.length) * 100);
    }

    // Event breakdown stats
    stats.eventBreakdown = await Promise.all(
      yearEvents.map(async (e) => {
        const [pCount, iCount] = await Promise.all([
          db.participation.count({ where: { eventId: e.id } }),
          db.interview.count({ where: { participation: { eventId: e.id } } }),
        ]);
        return {
          id: e.id,
          name: e.publicName || e.titre,
          date: e.date,
          status: e.status,
          participants: pCount,
          interviews: iCount,
        };
      }),
    );
  }

  return {
    selectedYear,
    stats,
  };
};
