import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { dateKeyToDbDate } from '$lib/domain/eventPresence';
import { noteCreateSchema } from '$lib/validation/talentNotes';
import {
  NOTE_INCLUDE,
  requireTalentNoteAccess,
  serializeNote,
} from '$lib/server/talentNotes';
import type { RequestHandler } from './$types';

/**
 * Staff notes about a talent (the multi-note feed that replaced the single
 * `Talent.note` column). Both the dev fiche and the émargement dialog read/write
 * here over `fetch`; the dialog lazy-loads via GET so the ~200-row roster never
 * carries note bodies. Access is dev-member + campus-scoped (see
 * `requireTalentNoteAccess`).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  await requireTalentNoteAccess(locals, params.id);
  const notes = await prisma.note_TalentNote.findMany({
    where: { talentId: params.id },
    orderBy: { createdAt: 'desc' },
    include: NOTE_INCLUDE,
  });
  return json({ notes: notes.map(serializeNote) });
};

/** Creates a note authored by the acting staff member. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const { staffId, campusId } = await requireTalentNoteAccess(
    locals,
    params.id,
  );

  const parsed = noteCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Note invalide.');
  }
  const { body, eventId, presenceDay, presenceSlot } = parsed.data;

  // Optional context anchor — only accept an event on this staff's campus, so a
  // forged id can't link a note to another campus's event.
  if (eventId) {
    const ok = await prisma.event.findFirst({
      where: { id: eventId, campusId },
      select: { id: true },
    });
    if (!ok) throw error(400, 'Événement introuvable.');
  }

  const note = await prisma.note_TalentNote.create({
    data: {
      talentId: params.id,
      authorId: staffId,
      body,
      eventId: eventId ?? null,
      // The créneau the note was taken on (émargement dialog only); the schema
      // refine guarantees both halves are present together and carry an event.
      presenceDay: presenceDay ? dateKeyToDbDate(presenceDay) : null,
      presenceSlot: presenceSlot ?? null,
    },
    include: NOTE_INCLUDE,
  });
  return json({ note: serializeNote(note) }, { status: 201 });
};
