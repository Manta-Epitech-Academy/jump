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

/**
 * One line out of several, always the same one for the same key. A line seen
 * often rotates so it does not wear out, but never at random: the server render
 * and the page would pick different ones. FNV-1a spreads short keys well enough.
 */
export function pickLine(lines: readonly string[], key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return lines[(hash >>> 0) % lines.length];
}

const NO_MATCH_LINES = [
  "Même Salesforce n'a trouvé personne.",
  'Vos filtres sont peut-être un peu exigeants.',
  'Personne ne passe ces filtres. Desserrez-en un ?',
] as const;

/**
 * Under « Aucun résultat » when a filter leaves a dev table empty. Keyed by the
 * page's path, so the line holds still while a search is being typed and
 * changes from one page, or one event, to the next.
 */
export function noMatchLine(pagePath: string): string {
  return pickLine(NO_MATCH_LINES, pagePath);
}

/**
 * An event nobody is shown in yet, named in the event's own cohort noun. Its
 * plural sits after « les », with nothing to agree with it: the noun is typed
 * freely, « collégienne » as well as « stagiaire ».
 */
export function emptyCohortLine(plural: string): string {
  return `La salle est prête, il ne manque que les ${plural}.`;
}

/** The closings tally of an event before anyone has led one. */
export const FIRST_PLACE_LINE = 'La première place est à prendre.';

/**
 * The banner of an event's last closing, read once by whoever finalises it: the
 * end of a series is worth more than « done ». `total` is the number of
 * closings the event had, when the close action counted it.
 */
export function lastClosingLine(total: number | null): string {
  if (total === 1)
    return "C'était le seul closing de l'événement. Belle session !";
  if (total)
    return `C'était le dernier : les ${total} closings de l'événement sont finalisés. Belle session !`;
  return "C'était le dernier closing de l'événement. Belle session !";
}

/** The closings synthesis once every closing of the event is finalised. */
export const ALL_CLOSINGS_DONE_LINE =
  "Tous les closings de l'événement sont finalisés. Belle session !";

const ALL_PRESENT_LINES = [
  'Au complet. Ça fait plaisir.',
  "Tout le monde est là, personne n'a séché.",
  'Salle comble sur ce créneau.',
] as const;

/**
 * A créneau where every listed talent is marked present or late. Keyed by the
 * créneau, so its line holds while the appel goes on and the next créneau gets
 * another.
 */
export function allPresentLine(slotKey: string): string {
  return pickLine(ALL_PRESENT_LINES, slotKey);
}

/**
 * A lost page in the dev space. The error page's title above it, « Page
 * introuvable_ », ends in the cursor it points at.
 */
export const NOT_FOUND_LINE = "Il n'y a rien ici, à part vous et ce curseur.";
