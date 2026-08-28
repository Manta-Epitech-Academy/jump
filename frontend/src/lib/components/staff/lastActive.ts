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

/**
 * How a "last activity" date ORDERS on a staff list, beside how it reads.
 *
 * Never active sorts to the far end of the axis rather than being treated as a
 * missing value, and that is the one column on the staff tables where this is
 * the right call. `rowComparator` sinks valueless rows in both directions
 * because an absent Lycée means the column cannot describe the row, so leading
 * with a block of "—" says nothing. Here the absence IS the value, for the same
 * reason `lastActiveLabel` returns "Jamais" rather than an em dash: an account
 * nobody has ever opened is the single most actionable row on the page, and
 * "away the longest" is exactly what it is.
 *
 * So `isMissing` is deliberately NOT passed alongside this on the members
 * directory: one click groups every never-connected member at the top, which is
 * what a "Jamais connectés" tile used to do with a filter of its own.
 */
export function compareLastActive(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): number {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}
