import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildEventIcs } from '#lib/domain/ics.ts';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';
import { recordUsage } from '#lib/server/usage/record.ts';
import { enrolledEventCalendar } from '#lib/server/services/talentHomeHero.ts';

/**
 * « Ajouter à mon agenda » (#501, AC4): an event the talent is enrolled in, as
 * a calendar file their phone opens, served by Jump and by no outside service.
 * Only for an enrolment the dev space shows, the rule the hero offers it
 * under, so an id typed by hand finds nothing rather than somebody's event.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const event = await enrolledEventCalendar(locals.talent.id, params.eventId);
  if (!event) throw error(404, 'Événement introuvable');

  recordUsage(USAGE_FEATURES.TALENT_AGENDA_ADD, {
    locals,
    eventId: event.id,
  });

  return new Response(buildEventIcs(event, new Date()), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${calendarFilename(event.name)}"`,
    },
  });
};

/** « halloween-camp.ics »: the event's name, ASCII only for the header. */
function calendarFilename(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'evenement'}.ics`;
}
