import { error, type RequestHandler } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';
import { can } from '$lib/domain/permissions';
import { loadStageOr404 } from '$lib/server/services/stageContext';
import {
  buildIcsCalendar,
  uidFor,
} from '$lib/server/services/calendarSync/ics';

/**
 * `.ics` download endpoint — kept as the universal fallback regardless of
 * which `INTERVIEW_SYNC_MODE` is active. Lets a user grab their interview
 * calendar even before connecting Outlook (graph mode) or before the
 * first email invite goes out (email mode).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireFlag(locals, 'stage_seconde');

  const role = locals.staffProfile?.staffRole;
  if (!can('interviewers', role)) {
    throw error(403, 'Réservé aux interviewers du campus.');
  }
  const staffId = locals.staffProfile?.id;
  if (!staffId) throw error(403, 'Profil staff manquant.');

  const campusId = getCampusId(locals);
  const event = await loadStageOr404(
    params.id!,
    campusId,
    'Les entretiens sont réservés aux stages de seconde.',
  );
  const db = scopedPrisma(campusId);

  const interviews = await db.interview.findMany({
    where: {
      participation: { eventId: event.id },
      staffId,
      status: { not: 'cancelled' },
    },
    include: { talent: true },
    orderBy: { date: 'asc' },
  });

  const ics = buildIcsCalendar({
    method: 'PUBLISH',
    calendarName: `Mes entretiens — ${event.titre}`,
    events: interviews.map((iv) => ({
      interview: iv,
      uid: uidFor(iv.id),
      sequence: 0,
    })),
  });

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="entretiens-${event.id}.ics"`,
    },
  });
};
