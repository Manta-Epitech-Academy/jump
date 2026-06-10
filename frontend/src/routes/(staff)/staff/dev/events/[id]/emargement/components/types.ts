import type { Prisma } from '@prisma/client';

// Lean roster select for the émargement table: identity, level and the contacts
// staff need to reach a no-show (the stagiaire, then up to two guardians, each
// with a phone and an email fallback). The roster is READ from Participation
// (the Salesforce campaign-member mirror), but émargement state is stored
// autonomously in EventPresence keyed by talentId. The server load imports this
// so the query and the row type can never drift.
export const PRESENCE_ROSTER_SELECT = {
  talentId: true,
  talent: {
    select: {
      nom: true,
      prenom: true,
      niveau: true,
      civilite: true,
      email: true,
      phone: true,
      user: { select: { email: true } },
      parentCivilite: true,
      parentPrenom: true,
      parentNom: true,
      parentEmail: true,
      parentPhone: true,
      parent2Civilite: true,
      parent2Prenom: true,
      parent2Nom: true,
      parent2Email: true,
      parent2Phone: true,
    },
  },
} satisfies Prisma.ParticipationSelect;

/** A legal guardian to reach when the stagiaire doesn't pick up. */
export type Guardian = {
  civilite: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** One projected roster row. `talentId` is the stable row key. */
export type PresenceRow = {
  talentId: string;
  nom: string;
  prenom: string;
  civilite: string | null;
  email: string | null;
  phone: string | null;
  /** Up to two guardians, in priority order; empty when none are on file. */
  guardians: Guardian[];
};

export type PresenceSortKey = 'prenom' | 'nom';
