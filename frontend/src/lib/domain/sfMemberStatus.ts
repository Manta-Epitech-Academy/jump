/**
 * Salesforce CampaignMember status mapping.
 *
 * Statuses are Salesforce vocabulary, stored normalized (trimmed + uppercased)
 * in `Participation.sfMemberStatus`. Never expose raw words to users; French
 * labels only.
 *
 * Business rules (July 2026 seminar, firm):
 *   - The worker syncs ALL campaign members regardless of status.
 *   - Visible statuses in the dev space: READY and the attended status only.
 *   - CONNECTED and DESISTED are never shown anywhere in dev.
 *   - For a PAST event: attended = present, READY = absent.
 *
 * The attended word is `MET`. The seminar notes, and this file until #368, said
 * `MEET`, which Salesforce never sends: every attendee was hidden from the dev
 * space and counted nowhere, and nothing said so, because a word this file does
 * not declare is hidden without a sound. That is why each word is written once,
 * below, and every definition, label and test reads it from here.
 */

import type { Prisma } from '@prisma/client';

/** Salesforce's word for a member who attended. */
export const SF_STATUS_ATTENDED = 'MET';

/** Salesforce's word for a member who confirmed they would come. */
export const SF_STATUS_CONFIRMED = 'READY';

/** Statuses shown in the dev workspace. Null (legacy) is also visible. */
export const SF_VISIBLE_STATUSES = [
  SF_STATUS_CONFIRMED,
  SF_STATUS_ATTENDED,
] as const;

/** Statuses the dev workspace never shows. Retained in the DB for diagnosis. */
export const SF_HIDDEN_STATUSES = ['CONNECTED', 'DESISTED'] as const;

/**
 * Every status we know Salesforce sends, visible and hidden together.
 *
 * A CATALOGUE OF KNOWN VALUES, NOT A CLOSED SET. The worker syncs every campaign
 * member whatever its status, and `normalizeSfStatus` only trims and uppercases:
 * a fifth word invented in Salesforce tomorrow is stored as it arrives. That is
 * the whole reason `Participation.sfMemberStatus` is a `String` and not a Prisma
 * enum - turning it into one would make an unknown status a write failure in the
 * middle of a sync, which is the opposite of what an anti-corruption boundary is
 * for.
 *
 * It exists because the two hidden words used to live in a comment here, in a
 * table in JARGON.md, and in the keys of a component-local record - so anything
 * needing the full list (the seed generator, its coverage check) had no choice
 * but to restate them a fourth time.
 */
export const SF_MEMBER_STATUSES = [
  ...SF_VISIBLE_STATUSES,
  ...SF_HIDDEN_STATUSES,
] as const;

/** One of the statuses we know about. Raw input is still a plain `string`. */
export type SfMemberStatus = (typeof SF_MEMBER_STATUSES)[number];

/**
 * Prisma where-fragment for the participations visible in the dev workspace:
 * the visible SF statuses plus legacy rows synced before the column existed
 * (`null`). Spread into any `Participation` where / relation filter so every dev
 * count, list and breakdown stays on one cohort definition and can't drift.
 */
export const visibleParticipationWhere = {
  OR: [
    { sfMemberStatus: { in: [...SF_VISIBLE_STATUSES] } },
    { sfMemberStatus: null },
  ],
} satisfies Prisma.ParticipationWhereInput;

/**
 * The participations the dev workspace masks: the exact complement of
 * `visibleParticipationWhere`, so the two sides of the rule cannot drift apart.
 * A masked enrolment is still synced and stored; only the dev space hides it.
 */
export const hiddenParticipationWhere = {
  NOT: visibleParticipationWhere,
} satisfies Prisma.ParticipationWhereInput;

/**
 * The same cohort rule in French, for the figures that travel with their own
 * definition (`adminApi/metrics.ts`, the weekly digest).
 *
 * It lives here, next to the `where` it describes, because it was written out by
 * hand in two aggregates at once: two copies of one rule, and both named the two
 * statuses while the filter also keeps legacy rows synced before the status
 * column existed. A definition that undersells what it counts is worse than no
 * definition, since it gets quoted verbatim to an admin.
 *
 * It names the dev space, never Jump, and says where the others are. It used to
 * read « visibles dans Jump », which a model relayed as « this event has 2
 * enrolments » for an event holding 5: the 3 masked ones are in Jump all the
 * same, synced and open to an admin. Only the dev space leaves them out.
 *
 * Reads as a clause, so a definition can compose it: "Participations aux
 * événements du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}."
 */
export const VISIBLE_PARTICIPATION_DEFINITION =
  "en ne comptant que les inscriptions affichées dans l'espace dev " +
  `(statut Salesforce ${SF_STATUS_CONFIRMED} ou ${SF_STATUS_ATTENDED}, plus les inscriptions importées avant l'ajout du statut) ; ` +
  "les autres sont bien synchronisées et enregistrées dans Jump, seul l'espace dev les masque";

/**
 * What the masked side counts, in French, for the figure that reports it next
 * to a dev-space count. Opens on its noun so a definition can lead into it:
 * "« hiddenFromDevSpace » compte les ${HIDDEN_PARTICIPATION_DEFINITION}".
 */
export const HIDDEN_PARTICIPATION_DEFINITION =
  "inscriptions synchronisées depuis Salesforce et enregistrées dans Jump, mais masquées de l'espace dev par leur statut Salesforce " +
  `(${SF_HIDDEN_STATUSES.join(', ')}, ou un statut que Jump ne connaît pas). ` +
  "Les admins les consultent dans « Membres Salesforce », sur la page Événements de l'espace admin. " +
  "Elles s'ajoutent aux inscriptions affichées dans l'espace dev : la somme des deux est ce que Jump a reçu de Salesforce pour cet événement.";

/**
 * What the dev space does with a stored status, and why.
 *
 *   - `shown`: a status the seminar decided to display.
 *   - `hidden`: a status the seminar decided to mask (a false lead, a withdrawal).
 *   - `unrecognised`: a word this file does not declare. Masked, like `hidden`,
 *     because showing an unknown status is the riskier default, but kept apart
 *     so that it can be reported: masking it in silence is how `MET` went
 *     unseen for a month.
 *   - `missing`: no status at all, a row synced before the column existed.
 *     Shown, to keep what those screens displayed before statuses arrived.
 */
export type SfStatusClass = 'shown' | 'hidden' | 'unrecognised' | 'missing';

export function classifySfStatus(status: string | null): SfStatusClass {
  const normalized = normalizeSfStatus(status);
  if (normalized === null) return 'missing';
  if ((SF_VISIBLE_STATUSES as readonly string[]).includes(normalized))
    return 'shown';
  if ((SF_HIDDEN_STATUSES as readonly string[]).includes(normalized))
    return 'hidden';
  return 'unrecognised';
}

/** Whether a participation appears in the dev workspace. */
export function isVisibleInDevSpace(status: string | null): boolean {
  const statusClass = classifySfStatus(status);
  return statusClass === 'shown' || statusClass === 'missing';
}

/**
 * For past events only: derive a presence outcome from the SF member status.
 *   - attended -> 'present'
 *   - READY -> 'absent' (said they would come, did not)
 *   - anything else -> null (no meaningful presence signal)
 */
export function pastEventPresence(
  status: string | null,
): 'present' | 'absent' | null {
  const normalized = normalizeSfStatus(status);
  if (normalized === SF_STATUS_ATTENDED) return 'present';
  if (normalized === SF_STATUS_CONFIRMED) return 'absent';
  return null;
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

/** French label for a presence outcome (past events). */
export function presenceLabel(presence: 'present' | 'absent'): string {
  return presence === 'present' ? 'Présent' : 'Absent';
}
