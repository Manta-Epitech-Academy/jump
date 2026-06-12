import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { talentNoteSchema } from '$lib/validation/talentNotes';
import type { RequestHandler } from './$types';

/**
 * Saves the staff-only free-text note on a talent (`Talent.note`), shared by the
 * dev fiche editor and the émargement modal.
 *
 * Optimistic concurrency: the caller posts `baseContent` (the note as the editor
 * loaded it). We only write if the DB note still equals it, via an atomic
 * compare-and-set (`updateMany where note=base`). A zero-row result means a
 * concurrent edit moved it underneath us -> 409 with the current value so the
 * caller can warn instead of clobbering.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
  requireStaffGroup(locals, 'devMember');

  const form = await request.formData();
  const parsed = talentNoteSchema.safeParse({
    content: form.get('content') ?? '',
    baseContent: form.get('baseContent') ?? '',
  });
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Note invalide.');
  }

  const campusId = getCampusId(locals);
  // Assert the talent is reachable from this staff's campus (403 otherwise,
  // null if it doesn't exist). `scopedPrisma.talent` has no `updateMany`, so the
  // atomic write below runs on the raw client — safe because access is asserted
  // here first.
  const visible = await scopedPrisma(campusId).talent.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!visible) throw error(404, 'Talent introuvable.');

  const next = parsed.data.content || null;
  const base = parsed.data.baseContent || null;

  const res = await prisma.talent.updateMany({
    where: { id: params.id, note: base },
    data: { note: next },
  });

  if (res.count === 0) {
    const current =
      (
        await prisma.talent.findUnique({
          where: { id: params.id },
          select: { note: true },
        })
      )?.note ?? null;
    return json({ conflict: true, current }, { status: 409 });
  }

  return json({ ok: true, note: next });
};
