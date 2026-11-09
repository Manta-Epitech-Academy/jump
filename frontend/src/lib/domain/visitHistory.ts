/**
 * A talent's parcours at Epitech, as an event's roster reads it: how many times
 * they had already come to an event on the campus before this one.
 *
 * Counted on visits, not on enrolments (#491). « 3ᵉ inscription » read
 * differently to every recruiter (in the campaign? at MET? on a stage?), and
 * « Déjà venu 3 fois » is the line they act on: who they are about to meet. A
 * visit is `domain/attendance.ts`'s « venu », so a talent enrolled three times
 * who never came is « Nouveau », which is what the word means: their first
 * time at an event.
 *
 * Agreed with the civilité, as the 2027 mockup writes it, and with « ·e » where
 * the talent chose « Autre » or gave none.
 */

import type { Civilite } from './profile';

type Agreement = 'm' | 'f' | 'x';

function agreementOf(civilite: string | null): Agreement {
  if (civilite === ('homme' satisfies Civilite)) return 'm';
  if (civilite === ('femme' satisfies Civilite)) return 'f';
  return 'x';
}

const NEWCOMER: Record<Agreement, string> = {
  m: 'Nouveau',
  f: 'Nouvelle',
  x: 'Nouveau·elle',
};

const CAME: Record<Agreement, string> = {
  m: 'Déjà venu',
  f: 'Déjà venue',
  x: 'Déjà venu·e',
};

/** « Nouvelle », « Déjà venu 3 fois », for a talent with this many earlier visits. */
export function parcoursLabel(
  priorVisits: number,
  civilite: string | null,
): string {
  const agreement = agreementOf(civilite);
  return priorVisits <= 0
    ? NEWCOMER[agreement]
    : `${CAME[agreement]} ${priorVisits} fois`;
}
