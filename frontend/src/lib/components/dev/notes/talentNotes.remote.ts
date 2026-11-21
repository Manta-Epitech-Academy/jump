import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { prisma } from '#lib/server/db.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import {
  noteCreateSchema,
  noteUpdateSchema,
} from '#lib/validation/talentNotes.ts';
import {
  NOTE_INCLUDE,
  requireTalentNoteAccess,
  serializeNote,
} from '#lib/server/talentNotes.ts';
import { gatedCommand, gatedQuery } from '#lib/server/remoteFunctions.ts';
import { recordUsage } from '#lib/server/usage/record.ts';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';

/**
 * Staff notes about a talent (the multi-note feed that replaced the single
 * `Talent.note` column), read and written by the dev fiche and the émargement
 * dialog. The dialog asks for them on open so the ~200-row roster never
 * carries note bodies. Access is dev-member and campus-scoped
 * (`requireTalentNoteAccess`): any dev member may manage any note, there is no
 * per-note ownership gate.
 *
 * Every write refreshes `talentNotes` for its talent in the same response, so
 * a dialog that opens on that talent again reads the list as it now is rather
 * than the one cached before the write (the émargement E2E caught exactly
 * that: a note written, the dialog closed and reopened on « Aucune note »).
 */

const talentId = z.string().min(1);
const noteRef = z.object({ talentId, noteId: z.string().min(1) });

/** Asserts the note exists and belongs to this talent (404 otherwise). */
async function assertNoteOfTalent(noteId: string, ofTalent: string) {
  const note = await prisma.note_TalentNote.findUnique({
    where: { id: noteId },
    select: { talentId: true },
  });
  if (!note || note.talentId !== ofTalent) error(404, 'Note introuvable.');
}

export const talentNotes = gatedQuery(
  { staff: 'devMember' },
  talentId,
  async (id, { locals }) => {
    await requireTalentNoteAccess(locals, id);
    const notes = await prisma.note_TalentNote.findMany({
      where: { talentId: id },
      orderBy: { createdAt: 'desc' },
      include: NOTE_INCLUDE,
    });
    return notes.map(serializeNote);
  },
);

/** Creates a note authored by the acting staff member. */
export const createTalentNote = gatedCommand(
  { staff: 'devMember' },
  z.object({ talentId, note: noteCreateSchema }),
  async ({ talentId: id, note: input }, { locals }) => {
    const { staffId, campusId } = await requireTalentNoteAccess(locals, id);
    const { body, eventId, presenceDay, presenceSlot } = input;

    // Optional context anchor: only accept an event on this staff's campus, so
    // a forged id can't link a note to another campus's event.
    if (eventId) {
      const ok = await prisma.event.findFirst({
        where: { id: eventId, campusId },
        select: { id: true },
      });
      if (!ok) error(400, 'Événement introuvable.');
    }

    const note = await prisma.note_TalentNote.create({
      data: {
        talentId: id,
        authorId: staffId,
        body,
        eventId: eventId ?? null,
        // The créneau the note was taken on (émargement dialog only); the
        // schema refine guarantees both halves are present together and carry
        // an event.
        presenceDay: presenceDay ? dateKeyToDbDate(presenceDay) : null,
        presenceSlot: presenceSlot ?? null,
      },
      include: NOTE_INCLUDE,
    });
    recordUsage(USAGE_FEATURES.DEV_TALENT_NOTE_CREATE, { locals });
    await talentNotes(id).refresh();
    return serializeNote(note);
  },
);

/**
 * Edits a note. Per-note optimistic concurrency: the caller sends the
 * `updatedAt` it loaded and the write compares-and-sets on it, so a concurrent
 * edit is never silently clobbered: it answers the current note instead.
 */
export const editTalentNote = gatedCommand(
  { staff: 'devMember' },
  noteRef.extend({ edit: noteUpdateSchema }),
  async ({ talentId: id, noteId, edit }, { locals }) => {
    const { staffId } = await requireTalentNoteAccess(locals, id);
    await assertNoteOfTalent(noteId, id);

    const res = await prisma.note_TalentNote.updateMany({
      where: { id: noteId, updatedAt: new Date(edit.baseUpdatedAt) },
      data: { body: edit.body, editedById: staffId },
    });

    if (res.count === 0) {
      const current = await prisma.note_TalentNote.findUnique({
        where: { id: noteId },
        include: NOTE_INCLUDE,
      });
      if (!current) error(404, 'Note introuvable.');
      return { outcome: 'conflict', note: serializeNote(current) } as const;
    }

    const note = await prisma.note_TalentNote.findUniqueOrThrow({
      where: { id: noteId },
      include: NOTE_INCLUDE,
    });
    recordUsage(USAGE_FEATURES.DEV_TALENT_NOTE_EDIT, { locals });
    await talentNotes(id).refresh();
    return { outcome: 'saved', note: serializeNote(note) } as const;
  },
);

/** Deletes a note (any dev member may delete any note). */
export const deleteTalentNote = gatedCommand(
  { staff: 'devMember' },
  noteRef,
  async ({ talentId: id, noteId }, { locals }) => {
    await requireTalentNoteAccess(locals, id);
    await assertNoteOfTalent(noteId, id);

    // `deleteMany`, not `delete`: `assertNoteOfTalent` above already 404s a
    // missing note, but two staff deleting the same note race between that
    // check and here. `delete` would throw P2025 (500) for the loser even
    // though the note is gone; `deleteMany` no-ops to count 0, so a concurrent
    // delete still reports success.
    await prisma.note_TalentNote.deleteMany({ where: { id: noteId } });
    recordUsage(USAGE_FEATURES.DEV_TALENT_NOTE_DELETE, { locals });
    await talentNotes(id).refresh();
  },
);
