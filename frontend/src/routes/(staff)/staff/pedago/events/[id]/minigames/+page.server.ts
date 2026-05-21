import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import {
  getActivePublication,
  getEventLeaderboard,
} from '$lib/server/services/minigameService';

/**
 * Read-only per-event leaderboard. Minigames are now an intrinsic platform
 * feature (no flag); pédago staff see this board to follow how their event's
 * talents are scoring. Scoped to attempts made during this event.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  requireStaffGroup(locals, 'pedaMember');

  const db = scopedPrisma(getCampusId(locals));
  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event) throw error(404, 'Événement introuvable.');

  const publication = await getActivePublication();
  const leaderboard = publication
    ? await getEventLeaderboard(publication.id, event.id)
    : { rows: [], scoringType: 'score' as const };

  return {
    event,
    publication,
    leaderboard,
  };
};
