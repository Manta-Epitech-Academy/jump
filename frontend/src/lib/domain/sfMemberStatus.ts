/**
 * Salesforce CampaignMember statuses, and what the dev space does with them.
 *
 * Statuses are Salesforce vocabulary, stored normalized (trimmed + uppercased)
 * in `Participation.sfMemberStatus`. The worker syncs every campaign member
 * whatever its status; only the dev space filters.
 *
 * Which words the dev space shows is CONFIGURATION, per event, and nothing in
 * this file names one (#371). It used to: READY and MET shown, CONNECTED and
 * DESISTED hidden, fixed at the July 2026 seminar. That stopped fitting the day a
 * Coding Club wanted its CONNECTED members and a stage did not, and it made every
 * word Salesforce added or renamed cost a release - the seminar's `MEET`, which
 * Salesforce never sends, hid every attendee for a month (#368) because a word
 * the code did not declare was hidden without a sound.
 *
 * Three pieces of data replace it, and this file holds the rules over them:
 *   - `Sync_MemberStatus`, the vocabulary Jump knows. A word missing from it is
 *     unrecognised: masked everywhere, and reported so somebody decides.
 *   - `EventConfig_ShownStatus`, the words one event shows.
 *   - `Participation.shownInDevSpace`, the projection every dev count and list
 *     filters on, recomputed by `services/devSpaceVisibility.ts`.
 *
 * Presence is not read off a status any more: the émargement is Jump's only
 * presence record.
 */

import type { Prisma } from '@prisma/client';

/**
 * Prisma where-fragment for the participations visible in the dev workspace.
 * Spread into any `Participation` where / relation filter so every dev count,
 * list and breakdown stays on one cohort definition and can't drift. It reads
 * the projection rather than the policy, because a `where` cannot compare a
 * participation's status with its event's rows.
 */
export const visibleParticipationWhere = {
  shownInDevSpace: true,
} satisfies Prisma.ParticipationWhereInput;

/**
 * The participations the dev workspace masks: the exact complement of
 * `visibleParticipationWhere`. A masked enrolment is still synced and stored;
 * only the dev space hides it.
 */
export const hiddenParticipationWhere = {
  shownInDevSpace: false,
} satisfies Prisma.ParticipationWhereInput;

/**
 * Whether the dev space shows an enrolment with this status on an event that
 * shows `shown`. A row with no status is always shown: it was synced before the
 * column existed, and no event can name the absence of a word (the migration's
 * CHECK holds that half).
 *
 * The SQL twin is `recomputeShownInDevSpace` in `services/devSpaceVisibility.ts`,
 * which applies the same rule to every row of an event at once; an integration
 * test keeps the two in agreement.
 */
export function isShownInDevSpace(
  status: string | null,
  shown: ReadonlySet<string>,
): boolean {
  const normalized = normalizeSfStatus(status);
  return normalized === null || shown.has(normalized);
}

/**
 * The same cohort rule in French, for the figures that travel with their own
 * definition (`adminApi/metrics.ts`, the weekly digest).
 *
 * It lives here, next to the `where` it describes, because it was written out by
 * hand in two aggregates at once, and a definition that undersells what it
 * counts is worse than no definition, since it gets quoted verbatim to an admin.
 *
 * It names the dev space, never Jump, and says where the others are. It used to
 * read « visibles dans Jump », which a model relayed as « this event has 2
 * enrolments » for an event holding 5: the 3 masked ones are in Jump all the
 * same, synced and open to an admin. Only the dev space leaves them out.
 *
 * It names no status either: which ones are shown is set event by event, so a
 * definition listing words would be wrong for some event the day it is quoted.
 *
 * Reads as a clause, so a definition can compose it: "Participations aux
 * événements du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}."
 */
export const VISIBLE_PARTICIPATION_DEFINITION =
  "en ne comptant que les inscriptions affichées dans l'espace dev " +
  "(celles dont le statut Salesforce fait partie des statuts que leur événement affiche, réglés événement par événement, plus les inscriptions importées avant l'ajout du statut) ; " +
  "les autres sont bien synchronisées et enregistrées dans Jump, seul l'espace dev les masque";

/**
 * What the masked side counts, in French, for the figure that reports it next
 * to a dev-space count. Opens on its noun so a definition can lead into it:
 * "« hiddenFromDevSpace » compte les ${HIDDEN_PARTICIPATION_DEFINITION}".
 */
export const HIDDEN_PARTICIPATION_DEFINITION =
  "inscriptions synchronisées depuis Salesforce et enregistrées dans Jump, mais masquées de l'espace dev par leur statut Salesforce " +
  "(un statut que leur événement n'affiche pas, ou un statut que Jump ne connaît pas). " +
  "Les admins les consultent dans « Membres Salesforce », sur la page Événements de l'espace admin.";

/**
 * What Jump holds for an event whatever the status, in French, for the figure
 * returned beside the shown and masked counts. Returned rather than described as
 * the sum of the other two: a definition that tells its reader to add two
 * figures leaves the one actually quoted to be computed downstream. Opens on its
 * noun, like {@link HIDDEN_PARTICIPATION_DEFINITION}.
 */
export const SYNCED_PARTICIPATION_DEFINITION =
  'inscriptions synchronisées depuis Salesforce et enregistrées dans Jump, quel que soit leur statut Salesforce : ' +
  "celles que l'espace dev affiche comme celles qu'il masque.";

/**
 * What the dev space does with a stored status on one event, and why.
 *
 *   - `shown`: a word the event shows.
 *   - `hidden`: a word Jump knows and the event does not show (a false lead, a
 *     withdrawal, or simply a format that does not want it).
 *   - `unrecognised`: a word missing from the catalogue. Masked, like `hidden`,
 *     because showing an unknown status is the riskier default, but kept apart
 *     so that it can be reported: masking it in silence is how `MET` went
 *     unseen for a month.
 *   - `missing`: no status at all, a row synced before the column existed.
 *     Shown, to keep what those screens displayed before statuses arrived.
 */
export type SfStatusClass = 'shown' | 'hidden' | 'unrecognised' | 'missing';

/**
 * What each class means for an enrolment, in French, worded around the dev space
 * and never around Jump: every one of these enrolments is in Jump.
 */
export const SF_STATUS_CLASS_LABELS: Record<SfStatusClass, string> = {
  shown: "affichée dans l'espace dev",
  hidden: "masquée de l'espace dev",
  unrecognised: "statut inconnu de Jump, masquée de l'espace dev",
  missing: "sans statut, affichée dans l'espace dev",
};

/**
 * Classify a stored status against the catalogue (`known`) and the event's own
 * policy (`shown`). Both are sets of normalized words, loaded by the caller: the
 * rule is pure, the data is not.
 */
export function classifySfStatus(
  status: string | null,
  vocabulary: { known: ReadonlySet<string>; shown: ReadonlySet<string> },
): SfStatusClass {
  const normalized = normalizeSfStatus(status);
  if (normalized === null) return 'missing';
  if (vocabulary.shown.has(normalized)) return 'shown';
  if (vocabulary.known.has(normalized)) return 'hidden';
  return 'unrecognised';
}

/** Normalize a raw SF status for DB storage: trim + uppercase. */
export function normalizeSfStatus(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}
