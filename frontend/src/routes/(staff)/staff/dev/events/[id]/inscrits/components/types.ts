import type { InscritStatus, RulesStatus } from '$lib/domain/dossierCompliance';
import type { ImageRightsStatus } from '$lib/domain/imageRights';
import type { ClosingListStatus } from '$lib/domain/closing';
import type { InscritsSortKey } from '$lib/domain/inscritsView';

/** An interest as a row carries it: enough for a chip and a filter value. */
export type InscritInterest = { id: string; nom: string; emoji: string | null };

/** One projected table row. `id` is the participation id (stable row key). */
export type InscritRow = {
  id: string;
  talentId: string;
  nom: string;
  prenom: string;
  civilite: string | null;
  niveau: string | null;
  schoolId: string | null;
  schoolName: string | null;
  // Cumulative XP, drives the sortable XP column + its explainer tooltip.
  xp: number;
  // Enrolments on the campus at earlier events: the Parcours column
  // (`$lib/domain/enrolmentHistory`).
  priorEnrolments: number;
  // Declared interests, split by kind and in the catalogue's own order.
  techInterests: InscritInterest[];
  persoInterests: InscritInterest[];
  // Folded three-state funnel status (jamais / en cours / prêt); see
  // `inscritStatus`. Drives the badge, the statut filter and the sort.
  status: InscritStatus;
  // Whether the talent ever genuinely logged in: gates the status above and
  // drives the tooltip's Connexion line.
  connected: boolean;
  // Per-document dossier states behind the status badge: drive its tooltip
  // breakdown and feed the fold above.
  rulesStatus: RulesStatus;
  imageStatus: ImageRightsStatus;
  // The student's own online signature (`rulesSignedAt != null`), the act that
  // invites the guardian. Splits an undecided image into "awaiting parent" vs
  // "pending" in the tooltip; distinct from `rulesStatus === 'signed'`, which a
  // staff offline attestation can reach without ever inviting a parent.
  studentSigned: boolean;
  // The talent's closing at this event; null when the event runs no closings.
  closingStatus: ClosingListStatus | null;
  // The recommendation option picked on the event's form; null when unanswered
  // or when the form asks none (`InscritsCohort.reco` says which).
  recoOptionId: string | null;
  // Search haystack extras (not shown as columns).
  email: string | null;
  sfMemberStatus: string | null;
};

export type SortKey = InscritsSortKey;

/** The cohort payload streamed behind the page shell's `{#await}`: everything
 *  that needs the DB. Shared by the page load and `InscritsResults` so the
 *  streamed shape and the consuming component can never drift. */
export type InscritsCohort = {
  rows: InscritRow[];
  /** Whether the event runs closings: shows the Closing column. */
  hasClosings: boolean;
  /** The form's recommendation verdicts in its own order, or null when the
   *  event has no live form asking one: shows the Reco column. */
  reco: { options: { id: string; label: string }[] } | null;
};
