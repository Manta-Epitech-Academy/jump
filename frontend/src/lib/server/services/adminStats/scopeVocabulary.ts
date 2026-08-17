/**
 * The values the `campus` and `schoolYear` filters accept.
 *
 * Exists because the tier had no way to say what it would accept. `scope.ts`
 * refuses an unknown campus and names the valid ones, which is the right posture
 * for a mistake and a poor way to learn a vocabulary: it made a deliberate error
 * the only discovery path, and the answer to "compare nos campus" depends on
 * knowing the names first. The other list, the school years, was only reachable
 * through `stats_events_overview`, a configuration answer national leadership
 * cannot call at all.
 *
 * Reads the same two sources the refusals read (`listCampusNames`,
 * `scopedEvents().availableSchoolYears`), so what is offered and what is accepted
 * cannot drift.
 *
 * No "current school year". The 31 July cutoff is timezone-aware and campuses do
 * not share a timezone (La Réunion), so a single "now" would be wrong somewhere;
 * the list is newest first, which answers the question without inventing a date.
 */

import { metric, type Metric } from '$lib/server/adminApi/metrics';
import { listCampusNames } from '$lib/server/adminApi/scope';
import { scopedEvents } from './cohort';

export type CampusVocabulary = {
  name: string;
  /** Events recorded on this campus, all years. */
  events: number;
};

export type ScopeVocabulary = {
  campuses: Metric<CampusVocabulary[]>;
  schoolYears: Metric<string[]>;
};

export async function getScopeVocabulary(): Promise<ScopeVocabulary> {
  const [names, { events, availableSchoolYears }] = await Promise.all([
    listCampusNames(),
    scopedEvents({}),
  ]);

  const eventsPerCampus = new Map<string, number>();
  for (const event of events) {
    eventsPerCampus.set(
      event.campusName,
      (eventsPerCampus.get(event.campusName) ?? 0) + 1,
    );
  }

  return {
    campuses: metric(
      names.map((name) => ({ name, events: eventsPerCampus.get(name) ?? 0 })),
      "Tous les campus, par ordre alphabétique : c'est exactement l'orthographe que le filtre « campus » attend, et la casse est ignorée. « events » est le nombre d'événements enregistrés sur ce campus, toutes années confondues. Un campus à 0 existe et répondra zéro sans erreur : ce n'est pas une anomalie, il n'a simplement pas encore d'événement dans Jump.",
    ),
    schoolYears: metric(
      availableSchoolYears,
      "Années scolaires ayant au moins un événement enregistré, de la plus récente à la plus ancienne. C'est ce que le filtre « schoolYear » attend, et toute autre valeur est refusée plutôt que répondue à zéro. L'année scolaire bascule le 31 juillet : un événement de juin 2027 appartient à « 2026-2027 ».",
    ),
  };
}
