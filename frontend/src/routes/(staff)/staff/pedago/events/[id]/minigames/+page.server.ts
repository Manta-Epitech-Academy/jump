import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import {
  getActivePublication,
  getLeaderboard,
} from '$lib/server/services/minigameService';
import { toggleEventSchema } from '$lib/validation/minigames';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'minigames');
  requireStaffGroup(locals, 'pedaMember');

  const db = scopedPrisma(getCampusId(locals));
  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event) throw error(404, 'Événement introuvable.');

  const settings = await prisma.eventMinigameSettings.findUnique({
    where: { eventId: event.id },
  });

  const form = await superValidate(
    { enabled: settings?.enabled ?? false },
    zod4(toggleEventSchema),
  );

  const publication = await getActivePublication();
  const leaderboard = publication
    ? await getLeaderboard(publication.id, event.id)
    : { rows: [], scoringType: 'score' as const };

  return {
    event,
    form,
    publication,
    leaderboard,
  };
};

export const actions: Actions = {
  toggle: async ({ request, params, locals }) => {
    requireFlag(locals, 'minigames');
    requireStaffGroup(locals, 'pedaMember');

    const db = scopedPrisma(getCampusId(locals));
    const event = await db.event.findUnique({ where: { id: params.id } });
    if (!event) throw error(404, 'Événement introuvable.');

    const form = await superValidate(request, zod4(toggleEventSchema));
    if (!form.valid) return fail(400, { form });

    await prisma.eventMinigameSettings.upsert({
      where: { eventId: event.id },
      create: {
        eventId: event.id,
        enabled: form.data.enabled,
        updatedById: locals.user?.id ?? null,
      },
      update: {
        enabled: form.data.enabled,
        updatedById: locals.user?.id ?? null,
      },
    });

    return message(
      form,
      form.data.enabled
        ? 'Mini-jeux activés pour cet event.'
        : 'Mini-jeux désactivés pour cet event.',
    );
  },
};
