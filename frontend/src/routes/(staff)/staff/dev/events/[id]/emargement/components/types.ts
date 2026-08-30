import type { Prisma } from '@prisma/client';
import type { PresenceRecord } from '$lib/domain/eventPresence';

// Lean roster select for the émargement table: only fields displayed in the
// list plus note anchors. Contact details are fetched on demand when opening
// the ContactDialog, so we avoid bulk-shipping parent/student PII in the
// streamed cohort payload.
export const PRESENCE_ROSTER_SELECT = {
  talentId: true,
  sfMemberStatus: true,
  talent: {
    select: {
      nom: true,
      prenom: true,
      // Not the bodies (lazy-loaded by the dialog): the count drives the hover
      // tooltip, and each note's stored créneau anchor (presenceDay + presenceSlot)
      // lets the roster light only the talents noted in the slot on screen. Anchor
      // only, so even a chatty talent's notes stay cheap over ~200 rows.
      _count: { select: { notes: true } },
      notes: { select: { presenceDay: true, presenceSlot: true } },
    },
  },
} satisfies Prisma.ParticipationSelect;

/** One projected roster row. `talentId` is the stable row key. */
export type PresenceRow = {
  talentId: string;
  sfMemberStatus: string | null;
  nom: string;
  prenom: string;
  /** Count of staff notes on this talent; surfaced in the trigger's hover tooltip.
   *  The note bodies are lazy-loaded by the dialog, not carried in the roster. */
  noteCount: number;
  /** The distinct créneau keys (`${day}|${slot}`) this talent has a note in, from
   *  each note's stored anchor. The trigger lights only when the active créneau is
   *  in here. */
  noteSlotKeys: string[];
};

// Export-specific select kept separate from the streamed roster payload: the
// XLSX includes contact columns, so those fields are loaded only in the export
// route (not in the UI stream).
export const PRESENCE_EXPORT_SELECT = {
  talentId: true,
  sfMemberStatus: true,
  talent: {
    select: {
      nom: true,
      prenom: true,
      niveau: true,
      phone: true,
      parentPhone: true,
    },
  },
} satisfies Prisma.ParticipationSelect;

export type PresenceSortKey = 'prenom' | 'nom';

/** The cohort payload streamed behind the page shell: the heavy roster join and
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
