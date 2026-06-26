import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requireAdmin } from '$lib/server/feedbackFormsAdmin';
import {
  computeFormStats,
  getPublicRespondents,
  getEventResponseBreakdown,
  type StatsScope,
} from '$lib/server/feedbackStats';

// Per-form aggregate reporting, co-located with the form it belongs to. A form
// is reused across many events (every Coding Club binds to the same default
// form), so the responses are pivoted on EVENT: the page reports one event's
// slice ("le Coding Club de juin") rather than an undifferentiated pile, with a
// "Tous les événements" overview and a "Réponses publiques" (hors-événement)
// bucket. The campus filter still spans both channels (event campus + the public
// self-reported label).
export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAdmin(locals);

  const form = await prisma.feedback_Form.findUnique({
    where: { id: params.id },
    select: { id: true, slug: true, title: true, allowsPublicAccess: true },
  });
  if (!form) throw error(404, 'Formulaire introuvable');

  const campusName = url.searchParams.get('campus') || undefined;
  const eventParam = url.searchParams.get('event') || 'all';

  // Cheap shell, awaited so the page chrome (filters) paints at once: the campus
  // list and the per-event response breakdown that fills the event filter.
  const [campuses, breakdown] = await Promise.all([
    prisma.campus.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getEventResponseBreakdown(form.id, { campusName }),
  ]);

  // Resolve the event axis from the param, falling back to "all" for a stale id
  // (an event with no responses under the current campus filter, or a deleted
  // one) so a dangling link never reads as an empty page.
  const knownEvent =
    eventParam !== 'all' &&
    eventParam !== 'public' &&
    breakdown.events.some((e) => e.eventId === eventParam);
  const selectedEvent =
    eventParam === 'public' || knownEvent ? eventParam : 'all';

  const scope: StatsScope = {
    campusName,
    ...(selectedEvent === 'public'
      ? { noEvent: true }
      : selectedEvent !== 'all'
        ? { eventId: selectedEvent }
        : {}),
  };

  // Heavy aggregation (groupBys + the free-text scan) is streamed, not awaited:
  // per the staff streaming rule, cohort-scale work must not block the load. The
  // page resolves this behind a ResultsSkeleton.
  const results = Promise.all([
    computeFormStats(form.id, scope),
    getPublicRespondents(form.id, scope),
  ]).then(([stats, publicRespondents]) => {
    // The form's existence is already enforced above; computeFormStats only
    // returns null if its graph vanished mid-request (deleted concurrently), so
    // surface that as a 404 rather than thread a nullable stats through the page.
    if (!stats) throw error(404, 'Formulaire introuvable');
    return { stats, publicRespondents };
  });

  return {
    form,
    campuses,
    breakdown,
    selectedCampus: campusName ?? 'all',
    selectedEvent,
    results,
  };
};
