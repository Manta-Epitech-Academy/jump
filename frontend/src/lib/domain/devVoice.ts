/**
 * The dev space's voice: every line that is there to make a recruiter smile, in
 * one file so they can be read, and rewritten, side by side.
 *
 * What a line may say is in `.claude/rules/ui.md` (the dev space's voice): the
 * reader is a recruiter, so no engineer's joke; never on a failure or on lost
 * work; never at a talent's expense; and no agreement with the cohort noun,
 * which an admin types freely.
 */

export type GreetingInput = {
  /** Hour on the campus clock, 0 to 23 (`campusClock`). */
  hour: number;
  /** ISO weekday on the campus clock, 1 Monday to 7 Sunday. */
  weekday: number;
  firstName: string | null;
  /** An event of the campus starts today. */
  startsToday: boolean;
};

/**
 * The calendar's greeting, the first line a dev member reads in the morning.
 * The late hour wins over everything, jour J over the day of the week. The
 * question mark is held to its word by a no-break space, so a display title
 * never wraps it onto a line of its own.
 */
export function greetingFor({
  hour,
  weekday,
  firstName,
  startsToday,
}: GreetingInput): string {
  const name = firstName ? `, ${firstName}` : '';
  if (hour < 5 || hour >= 21) return `Encore là${name} ?`;
  if (startsToday) return `C'est le jour J${name}`;
  if (weekday === 1 && hour < 12) return `Bonne semaine${name}`;
  if (weekday === 5 && hour >= 14) return `Bientôt le week-end${name}`;
  if (hour >= 18) return `Bonsoir${name}`;
  return `Bonjour${name}`;
}
