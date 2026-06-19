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
  event: { id: string; titre: string } | null;
};
