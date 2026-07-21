import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { dbDateToKey, slotKey } from '$lib/domain/eventPresence';
import { eventDisplayName } from '$lib/domain/event';
import type { SerializedNote } from '$lib/domain/talentNotes';

/** Author/editor identity + optional event anchor, for rendering the feed. */
export const NOTE_INCLUDE = {
  author: { select: { user: { select: { name: true, image: true } } } },
  editedBy: { select: { user: { select: { name: true, image: true } } } },
  event: { select: { id: true, titre: true, publicName: true } },
} satisfies Prisma.Note_TalentNoteInclude;

type NoteWithRelations = Prisma.Note_TalentNoteGetPayload<{
  include: typeof NOTE_INCLUDE;
}>;

export function serializeNote(note: NoteWithRelations): SerializedNote {
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    edited: note.editedById !== null,
    author: note.author
      ? { name: note.author.user.name, image: note.author.user.image }
      : null,
    editedBy: note.editedBy
      ? { name: note.editedBy.user.name, image: note.editedBy.user.image }
      : null,
    // The créneau anchor, flattened to the same `${day}|${slot}` key the émargement
    // roster uses, so the dialog matches a note to the active créneau exactly.
    presenceSlotKey:
      note.presenceDay && note.presenceSlot
        ? slotKey(dbDateToKey(note.presenceDay), note.presenceSlot)
        : null,
    event: note.event
      ? {
          id: note.event.id,
          name: eventDisplayName(note.event),
        }
      : null,
  };
}

/**
 * Asserts the acting staff is a dev member who can reach this talent from their
 * campus, and returns their identity (StaffProfile id) + campus. Any dev member
 * may then create/edit/delete any note (no per-note ownership gate). Throws
 * 403/404 otherwise. Mirrors the scoped-visibility pre-check the single-note
 * endpoint used before its raw write.
 */
export async function requireTalentNoteAccess(
  locals: App.Locals,
  talentId: string,
): Promise<{ staffId: string; campusId: string }> {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const visible = await scopedPrisma(campusId).talent.findUnique({
    where: { id: talentId },
    select: { id: true },
  });
  if (!visible) throw error(404, 'Talent introuvable.');
  return { staffId: locals.staffProfile.id, campusId };
}
