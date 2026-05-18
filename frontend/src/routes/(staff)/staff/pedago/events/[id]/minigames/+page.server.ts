import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import {
  getActivePublication,
  getLeaderboard,
} from '$lib/server/services/minigameService';

/**
 * Read-only leaderboard for an event. Per-event activation toggling moved
 * out — mini-games are now gated only by the campus-level `minigames`
 * feature flag (admin-controlled). Pédago staff still see the leaderboard
 * here to follow how their event's talents are scoring.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  requireFlag(locals, 'minigames');
  requireStaffGroup(locals, 'pedaMember');

  const db = scopedPrisma(getCampusId(locals));
  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event) throw error(404, 'Événement introuvable.');

  const publication = await getActivePublication();
  const leaderboard = publication
    ? await getLeaderboard(publication.id, event.id)
    : { rows: [], scoringType: 'score' as const };

  return {
    event,
    publication,
    leaderboard,
  };
};
