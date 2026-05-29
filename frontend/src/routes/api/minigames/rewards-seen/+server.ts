import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  markMinigameRewardsSeen,
  markMinigameRankRewardsSeen,
} from '$lib/server/services/minigameService';

/**
 * Mark a talent's unseen minigame reward floats as seen, so each fires exactly
 * once wherever the player lands after a game (dashboard or leaderboard).
 * Page-agnostic on purpose: `MinigameRewardCelebration.svelte` is mounted on
 * several routes, so it acks here rather than through a per-page form action.
 * Idempotent and scoped to the caller's own talent, so a double-call or a stale
 * tab is harmless.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const { kinds } = (await request.json().catch(() => ({}))) as {
    kinds?: ('base' | 'rank')[];
  };
  const set = new Set(kinds ?? []);

  if (set.has('base')) await markMinigameRewardsSeen(locals.talent.id);
  if (set.has('rank')) await markMinigameRankRewardsSeen(locals.talent.id);

  return json({ ok: true });
};
