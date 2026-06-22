import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { noteUpdateSchema } from '$lib/validation/talentNotes';
import {
  NOTE_INCLUDE,
  requireTalentNoteAccess,
  serializeNote,
} from '$lib/server/talentNotes';
import type { RequestHandler } from './$types';

/** Asserts the note exists and belongs to this talent (404 otherwise). Any dev
 *  member may manage it — there is no per-note ownership gate. */
async function assertNoteOfTalent(noteId: string, talentId: string) {
  const note = await prisma.note_TalentNote.findUnique({
    where: { id: noteId },
    select: { talentId: true },
  });
  if (!note || note.talentId !== talentId) {
    throw error(404, 'Note introuvable.');
  }
}

/**
 * Edits a note. Per-note optimistic concurrency: the caller posts the
 * `updatedAt` it loaded; we compare-and-set on it so a concurrent edit can't be
 * silently clobbered — a zero-row result returns 409 with the current note.
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const { staffId } = await requireTalentNoteAccess(locals, params.id);
  await assertNoteOfTalent(params.noteId, params.id);

  const parsed = noteUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Note invalide.');
  }
  const { body, baseUpdatedAt } = parsed.data;

  const res = await prisma.note_TalentNote.updateMany({
    where: { id: params.noteId, updatedAt: new Date(baseUpdatedAt) },
    data: { body, editedById: staffId },
  });

  if (res.count === 0) {
    const current = await prisma.note_TalentNote.findUnique({
      where: { id: params.noteId },
      include: NOTE_INCLUDE,
    });
    if (!current) throw error(404, 'Note introuvable.');
    return json(
      { conflict: true, current: serializeNote(current) },
      { status: 409 },
    );
  }

  const note = await prisma.note_TalentNote.findUniqueOrThrow({
    where: { id: params.noteId },
    include: NOTE_INCLUDE,
  });
  return json({ note: serializeNote(note) });
};

/** Deletes a note (any dev member may delete any note). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  await requireTalentNoteAccess(locals, params.id);
  await assertNoteOfTalent(params.noteId, params.id);

  // `deleteMany`, not `delete`: `assertNoteOfTalent` above already 404s a missing
  // note, but two staff deleting the same note race between that check and here.
  // `delete` would throw P2025 (→ 500) for the loser even though the note is gone;
  // `deleteMany` no-ops to count 0, so a concurrent delete still reports success.
  await prisma.note_TalentNote.deleteMany({ where: { id: params.noteId } });
  return json({ ok: true });
};
