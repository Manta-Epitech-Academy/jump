import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markWorkshopRewardsSeen } from '$lib/server/services/workshopService';

/**
 * Mark a talent's unseen activity XP as celebrated.
 *
 * Page-agnostic and body-free on purpose, like the minigame sibling: the
 * celebration component acknowledges here rather than through a page action, so
 * it can be mounted anywhere the talent might land. Idempotent and scoped to the
 * caller's own talent, so a double call or a stale tab is harmless.
 */
export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');
  await markWorkshopRewardsSeen(locals.talent.id);
  return json({ ok: true });
};
