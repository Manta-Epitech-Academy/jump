import { fail } from '@sveltejs/kit';
import { scopedPrisma } from '$lib/server/db/scoped';

export async function toggleBringPc(
  formData: FormData,
  campusId: string,
  eventId: string,
) {
  const id = formData.get('id');
  const currentState = formData.get('state') === 'true';
  if (typeof id !== 'string' || !id) return fail(400);

  const db = scopedPrisma(campusId);
  try {
    // Asserts the participation belongs to this event AND campus.
    await db.participation.findFirstOrThrow({
      where: { id, eventId },
      select: { id: true },
    });

    await db.participation.update({
      where: { id },
      data: { bringPc: !currentState },
    });
    return { success: true };
  } catch (err: any) {
    if (err?.status === 403) throw err;
    console.error('Error toggling bring_pc:', err);
    return fail(500, { error: 'Erreur mise à jour PC' });
  }
}
