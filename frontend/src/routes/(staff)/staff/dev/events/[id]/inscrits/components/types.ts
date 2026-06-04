import type { Prisma } from '@prisma/client';

// The scoped-down inscrits page is one flat table: avatar, prenom, nom, lycee,
// niveau, readiness. No phase variants, no interview status, no last-activity.
// This select stays lean on purpose: the cohort fetch (~200 rows) must not drag
// the full Talent row (Salesforce-mirror columns) or full Interest rows. The
// server load imports this select so the query and the row type can never drift.
export const INSCRIT_TALENT_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  email: true,
  parentEmail: true,
  // Readiness inputs (see isRulesCompliant / isImageRightsCompliant).
  parentRulesSignedAt: true,
  imageRightsDecision: true,
  school: { select: { id: true, name: true } },
} satisfies Prisma.TalentSelect;

export const INSCRIT_PARTICIPATION_SELECT = {
  id: true,
  talentId: true,
  talent: { select: INSCRIT_TALENT_SELECT },
  // The offline-attested règlement signature lives on the participation, so it
  // joins the readiness computation alongside the talent's online co-signature.
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
  ready: boolean;
  // Search haystack extras (not shown as columns).
  email: string | null;
  parentEmail: string | null;
};

export type SortKey = 'prenom' | 'nom' | 'lycee' | 'niveau' | 'ready';
