import { toDateKey } from './planningTime';

export function getParentLastName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const rest = trimmed.split(' ').slice(1).join(' ');
  return rest || trimmed;
}

/**
 * A child's events as the parent page splits them: the one that starts today
 * and the ones that start later, each day read on its own campus's clock. The
 * reader's clock never decides it: a parent abroad, or one whose child's
 * campus is at La Réunion, still sees the programme of the day the campus is
 * living, the day it was announced for. `participations` come sorted by start.
 */
export function splitTodayAndUpcoming<
  P extends { event: { date: Date; campus: { timezone: string } } },
>(participations: P[], now: Date): { today: P | null; upcoming: P[] } {
  let today: P | null = null;
  const upcoming: P[] = [];
  for (const p of participations) {
    const timezone = p.event.campus.timezone;
    const day = toDateKey(p.event.date, timezone);
    const campusToday = toDateKey(now, timezone);
    if (day === campusToday) today ??= p;
    else if (day > campusToday) upcoming.push(p);
  }
  return { today, upcoming };
}
