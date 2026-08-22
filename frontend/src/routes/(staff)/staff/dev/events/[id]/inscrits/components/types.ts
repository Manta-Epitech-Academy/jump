import type { Prisma } from '@prisma/client';
import type { InscritStatus, RulesStatus } from '$lib/domain/dossierCompliance';
import type { ImageRightsStatus } from '$lib/domain/imageRights';

// The scoped-down inscrits page is one flat table: avatar, prenom, nom, lycee,
// niveau, statut. This select stays lean on purpose: the cohort fetch (~200 rows)
// must not drag the full Talent row (Salesforce-mirror columns) or full Interest
// rows. The server load imports this select so the query and the row type can
// never drift.
const INSCRIT_TALENT_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  // Cumulative XP (cached projection of the XpGrant ledger): the cohort table's
  // engagement signal - who is actually training on JUMP. Cheap scalar, so it
  // joins the shared select. The events count stays off here: the dense roster
  // shows XP alone, the fiche carries the fuller breakdown.
  xp: true,
  user: { select: { email: true } },
  // Dossier input for the image-rights gate of the statut badge. The two
  // règlement signatures are deliberately NOT selected here: they belong to the
  // dossier of the EVENT's school year, which the flat columns cannot answer for
  // (they hold the talent's most recent dossier). Both consumers read them from
  // `loadEventDossierSignatures` instead, so neither can drift onto the wrong
  // year.
  imageRightsDecision: true,
  // Has the talent ever genuinely logged in? Gates the statut badge. Read from
  // the durable `firstLoginAt` projection (stamped once on first real,
  // non-impersonated login), not a bauth_session probe: sessions are deleted by
  // logout / identity repair, which would drop a real login back to "never
  // connected". Same definition as the fiche's "première connexion".
  firstLoginAt: true,
  school: { select: { id: true, name: true } },
  // Contact + parent identity. Not shown in the table, but the XLSX export
  // (export/+server.ts) emits them so the download is a usable cohort contact
  // sheet (call the student, call the parents). Cheap scalar columns, so the
  // shared select carries them rather than the export forking its own — a second
  // select is exactly the drift this shared one exists to prevent.
  phone: true,
  parentPrenom: true,
  parentNom: true,
  parentPhone: true,
} satisfies Prisma.TalentSelect;

export const INSCRIT_PARTICIPATION_SELECT = {
  id: true,
  talentId: true,
  talent: { select: INSCRIT_TALENT_SELECT },
  sfMemberStatus: true,
} satisfies Prisma.ParticipationSelect;

export const INSCRIT_EXPORT_PARTICIPATION_SELECT = {
  ...INSCRIT_PARTICIPATION_SELECT,
  talent: {
    select: {
      ...INSCRIT_TALENT_SELECT,
      parentEmail: true,
    },
  },
} satisfies Prisma.ParticipationSelect;

/** One projected table row. `id` is the participation id (stable row key). */
export type InscritRow = {
  id: string;
  talentId: string;
  nom: string;
  prenom: string;
  niveau: string | null;
  schoolName: string | null;
  // Cumulative XP, drives the sortable XP column + its explainer tooltip.
  xp: number;
  // Folded three-state funnel status (jamais / en cours / prêt); see
  // `inscritStatus`. Drives the badge, the statut filter and the sort.
  status: InscritStatus;
  // Whether the talent ever genuinely logged in — gates the status above and
  // drives the tooltip's Connexion line.
  connected: boolean;
  // Per-document dossier states behind the status badge — drive its tooltip
  // breakdown and feed the fold above.
  rulesStatus: RulesStatus;
  imageStatus: ImageRightsStatus;
  // The student's own online signature (`rulesSignedAt != null`), the act that
  // invites the guardian. Splits an undecided image into "awaiting parent" vs
  // "pending" in the tooltip; distinct from `rulesStatus === 'signed'`, which a
  // staff offline attestation can reach without ever inviting a parent.
  studentSigned: boolean;
  // Search haystack extras (not shown as columns).
  email: string | null;
  sfMemberStatus: string | null;
};

export type SortKey = 'prenom' | 'nom' | 'lycee' | 'niveau' | 'xp' | 'status';

// Structural shapes for the streamed cohort payload. Declared here (not imported
// from `$lib/server/services/cohortOverview`) so this client-consumed file never
// pulls a server module into the browser bundle; the load's actual return is
// checked against these by assignment, and the rail cards accept them by shape.
export type LyceeOption = { schoolId: string; name: string; count: number };

export type OriginBreakdown<T> = {
  rows: T[];
  others: { count: number; categories: number } | null;
};

export type LyceeBreakdownStat = {
  schoolId: string;
  name: string;
  count: number;
};

export type InterestBreakdownStat = {
  interestId: string;
  nom: string;
  emoji: string | null;
  count: number;
};

/** The cohort payload streamed behind the page shell's `{#await}` — everything
 *  that needs the DB. Shared by the page load and `InscritsResults` so the
 *  streamed shape and the consuming component can never drift. */
export type InscritsCohort = {
  rows: InscritRow[];
  availableNiveaux: string[];
  lyceeOptions: LyceeOption[];
  lyceesBreakdown: OriginBreakdown<LyceeBreakdownStat>;
  interestsCloud: OriginBreakdown<InterestBreakdownStat>;
  cohort: { total: number };
};
