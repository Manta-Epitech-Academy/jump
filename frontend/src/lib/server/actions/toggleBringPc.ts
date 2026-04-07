import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export async function toggleBringPc(formData: FormData, campusId: string) {
  const id = formData.get('id') as string;
  const currentState = formData.get('state') === 'true';

  try {
    const participation = await prisma.participation.findUniqueOrThrow({
      where: { id },
      select: { campusId: true },
    });
    if (participation.campusId !== campusId) {
      throw error(403, 'Accès refusé.');
    }

    await prisma.participation.update({
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
