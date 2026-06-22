/** A staff member as shown on a note (name + avatar), from `bauth_user`. */
export type NoteStaff = { name: string | null; image: string | null };

/**
 * Wire shape of a note sent from the server to the feed. Dates are ISO strings
 * (serialised in `$lib/server/talentNotes`). Lives here, not in the server
 * module, so the client components can import the type without pulling a
 * server-only module into the browser bundle.
 */
export type SerializedNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** True once the note has been edited at least once (an editor was recorded). */
  edited: boolean;
  author: NoteStaff | null;
  editedBy: NoteStaff | null;
  /** The émargement créneau the note was taken on, as a `${day}|${slot}` key, or
   *  null for a general note (fiche) with no créneau. Lets the émargement dialog
   *  group "Ce créneau" on the stored anchor rather than the note's clock time. */
  presenceSlotKey: string | null;
  /** The event the note was taken at: `type` drives the condensed metadata label
   *  ("Stage de Seconde"), `titre` is kept for any future detail view. */
  event: { id: string; titre: string; type: string } | null;
};
