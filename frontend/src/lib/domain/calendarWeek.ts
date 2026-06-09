/**
 * Pure date/week helpers shared by the planning calendars. The talent calendar
 * and the dev read-only viewer both lay slots onto a Monday-Sunday week grid and
 * page through weeks; this module is the single home for the week math so the two
 * surfaces can't drift. No Svelte, no DOM: just dates.
 */

/** Midnight of the given date, in local time. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The Monday (00:00) of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  // Monday = 1 ... Sunday = 0; shift so Monday is the first day.
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

/** Whether two dates fall on the same calendar day. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** The seven days (Mon-Sun) of the week starting at `weekStart`. */
export function weekDaysFrom(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Land on the week of the slot closest to "now" so the viewer never opens onto a
 * blank gap week between two far-apart events (or after an all-past timeline).
 * Falls back to the week of `fallbackStart` (or today) when there are no slots.
 */
export function pickInitialWeek(
  nowMs: number,
  slots: { startTime: Date | string }[],
  fallbackStart: Date | null,
): Date {
  const today = startOfDay(new Date(nowMs));
  if (slots.length === 0) return startOfWeek(fallbackStart ?? today);
  let nearest = slots[0];
  let nearestDist = Infinity;
  for (const s of slots) {
    const dist = Math.abs(
      startOfDay(new Date(s.startTime)).getTime() - today.getTime(),
    );
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = s;
    }
  }
  return startOfWeek(startOfDay(new Date(nearest.startTime)));
}

/** A compact "1 – 7 déc 2026" style label for the visible week. */
export function weekLabel(weekDays: Date[]): string {
  const a = weekDays[0];
  const b = weekDays[6];
  const sameMonth = a.getMonth() === b.getMonth();
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: sameMonth && sameYear ? undefined : 'short',
    year: sameYear ? undefined : 'numeric',
  });
  const right = b.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${left} – ${right}`;
}
