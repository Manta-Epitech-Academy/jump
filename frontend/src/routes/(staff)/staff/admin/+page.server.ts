import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { recentRuns } from '$lib/server/services/syncRunService';
import { EventService } from '$lib/server/services/events';
import { isEventToPrepare } from '$lib/domain/eventReadiness';

export const load: PageServerLoad = async () => {
  // Retrieve global statistics
  const [campusCount, userCount, studentCount, events, lastRuns] =
    await Promise.all([
      prisma.campus.count(),
      // "Membres de l'équipe" = staff only. bauth_user also holds students and
      // parents (every OTP login mints one), so an unfiltered count inflated this
      // far past the staff list it links to. Match /staff/admin/users exactly.
      prisma.bauth_user.count({ where: { staffProfile: { isNot: null } } }),
      prisma.talent.count(),
      // The same view model the events cockpit renders: one read powers the
      // total, the "recently created" feed (sliced below) and the "à préparer"
      // count, so the dashboard can't disagree with /staff/admin/events.
      EventService.listAdminEvents(),
      // One row, newest first: the card answers "what did the worker last do",
      // and a run that is still open or that failed is exactly what somebody
      // opening this page needs to see.
      recentRuns(1),
    ]);

  // Newest first by creation, not by event date - the section answers "what did
  // someone just set up", which is the createdAt axis.
  const recentEvents = [...events]
    .sort((a, b) => b.createdTs - a.createdTs)
    .slice(0, 5);

  // Events still needing admin work before they go live (à configurer / prêt à
  // publier, past excluded): the cockpit's "À préparer" bucket, surfaced as the
  // one actionable cue on the dashboard's Événements card.
  const toPrepareCount = events.filter((e) =>
    isEventToPrepare({ status: e.status, configState: e.configState }),
  ).length;

  return {
    stats: {
      campuses: campusCount,
      users: userCount,
      students: studentCount,
      events: events.length,
      toPrepare: toPrepareCount,
    },
    recentEvents,
    lastRun: lastRuns[0] ?? null,
  };
};
