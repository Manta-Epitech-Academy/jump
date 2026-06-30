import type { Prisma } from '@prisma/client';
import type { PresenceRecord } from '$lib/domain/eventPresence';

// Lean roster select for the émargement table: identity, level and the contacts
// staff need to reach a no-show (the member, then up to two guardians, each
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
      // Not the bodies (lazy-loaded by the dialog): the count drives the hover
      // tooltip, and each note's stored créneau anchor (presenceDay + presenceSlot)
      // lets the roster light only the talents noted in the slot on screen. Anchor
      // only, so even a chatty talent's notes stay cheap over ~200 rows.
      _count: { select: { notes: true } },
      notes: { select: { presenceDay: true, presenceSlot: true } },
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

/** A legal guardian to reach when the member doesn't pick up. */
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
  /** Count of staff notes on this talent; surfaced in the trigger's hover tooltip.
   *  The note bodies are lazy-loaded by the dialog, not carried in the roster. */
  noteCount: number;
  /** The distinct créneau keys (`${day}|${slot}`) this talent has a note in, from
   *  each note's stored anchor. The trigger lights only when the active créneau is
   *  in here. */
  noteSlotKeys: string[];
  /** Up to two guardians, in priority order; empty when none are on file. */
  guardians: Guardian[];
};

export type PresenceSortKey = 'prenom' | 'nom';

/** The cohort payload streamed behind the page shell — the heavy roster join and
 *  the per-cell attendance computation. The slot grid, closures and cutoffs stay
 *  synchronous in the load (cheap, and the header QR button reads them on first
 *  paint), so only these three fields stream. Shared by the load and
 *  `EmargementRoster` so the streamed shape and the component can never drift. */
export type EmargementCohort = {
  rows: PresenceRow[];
  presences: PresenceRecord[];
  /** Null until at least one créneau is closed (nothing to rate yet). */
  attendanceRate: number | null;
};
