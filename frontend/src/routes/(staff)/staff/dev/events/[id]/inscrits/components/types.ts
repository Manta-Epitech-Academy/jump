import type { Prisma } from '@prisma/client';
import type { InscritStatus, RulesStatus } from '$lib/domain/stageCompliance';
import type { ImageRightsStatus } from '$lib/domain/imageRights';

// The scoped-down inscrits page is one flat table: avatar, prenom, nom, lycee,
// niveau, statut. This select stays lean on purpose: the cohort fetch (~200 rows)
// must not drag the full Talent row (Salesforce-mirror columns) or full Interest
// rows. The one exception is a minimal connection probe (a single real session
// id, see `user.sessions` below) that gates the statut badge. The server load
// imports this select so the query and the row type can never drift.
export const INSCRIT_TALENT_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  email: true,
  parentEmail: true,
  // Dossier inputs — feed the statut badge and its per-document tooltip
  // (see rulesStatus / imageRightsStatus). `rulesSignedAt` distinguishes the
  // "waiting on the parent co-signature" state from "nothing signed yet".
  rulesSignedAt: true,
  parentRulesSignedAt: true,
  imageRightsDecision: true,
  // Connection probe: has the talent ever genuinely logged in? One session id is
  // all the statut badge needs — `impersonatedBy: null` excludes admin
  // impersonation sessions so testing a talent's experience never marks them as
  // connected (same definition as the fiche's "première connexion").
  user: {
    select: {
      sessions: {
        where: { impersonatedBy: null },
        take: 1,
        select: { id: true },
      },
    },
  },
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
  // The offline-attested règlement signature lives on the participation, so it
  // joins the status computation alongside the talent's online co-signature.
  stageCompliance: { select: { charteSigned: true } },
} satisfies Prisma.ParticipationSelect;

export type ParticipationInscrit = Prisma.ParticipationGetPayload<{
  select: typeof INSCRIT_PARTICIPATION_SELECT;
}>;

/** One projected table row. `id` is the participation id (stable row key). */
export type InscritRow = {
  id: string;
  talentId: string;
  nom: string;
  prenom: string;
  niveau: string | null;
  schoolName: string | null;
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
  parentEmail: string | null;
};

export type SortKey = 'prenom' | 'nom' | 'lycee' | 'niveau' | 'status';
