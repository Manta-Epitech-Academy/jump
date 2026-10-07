import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markWorkshopRewardsSeen } from '$lib/server/services/workshopService';
import { workshopRewardAckSchema } from '$lib/validation/workshops';

/**
 * Mark a talent's activity XP as celebrated, up to what the dashboard showed.
 *
 * Page-agnostic, like the minigame sibling: the celebration component
 * acknowledges here rather than through a page action, so it can be mounted
 * anywhere the talent might land. The body names the amounts that were on
 * screen rather than "everything", so XP arriving during the animation stay
 * owed. Scoped to the caller's own talent, and the mark only ever rises, so a
 * double call or a stale tab is harmless.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const parsed = workshopRewardAckSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) throw error(400, 'Invalid payload: expected { upTo }');

  await markWorkshopRewardsSeen(locals.talent.id, parsed.data.upTo);
  return json({ ok: true });
};
