/**
 * How a "last activity" date reads on a staff list.
 *
 * Relative and coarse on purpose: the question these columns answer is "is this
 * person still around", and an exact timestamp makes a reader do the subtraction
 * themselves. `'Jamais'` is a real answer and not a missing value, which is why
 * it is a label rather than an em dash: an account nobody has ever opened is the
 * single most actionable row on the page.
 *
 * Shared because two lists show it, the admin talents directory and the admin
 * members directory, and a relative date that reads differently between two
 * lists is a bug in one of them. It used to be a local function inside
 * `TalentsResults.svelte`.
 *
 * Staff-facing, so vous applies to the surrounding copy; this string carries no
 * register of its own.
 */
export function lastActiveLabel(date: Date | string | null): string {
  if (!date) return 'Jamais';
  const diff = Date.now() - new Date(date).getTime();
  const day = 86_400_000;
  if (diff < day) return "Aujourd'hui";
  if (diff < 2 * day) return 'Hier';
  if (diff < 7 * day) return `Il y a ${Math.floor(diff / day)} j`;
  if (diff < 30 * day) return `Il y a ${Math.floor(diff / (7 * day))} sem`;
  if (diff < 365 * day) return `Il y a ${Math.floor(diff / (30 * day))} mois`;
  const years = Math.floor(diff / (365 * day));
  return `Il y a ${years} an${years > 1 ? 's' : ''}`;
}
