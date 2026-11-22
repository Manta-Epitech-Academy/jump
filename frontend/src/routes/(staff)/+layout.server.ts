import type { LayoutServerLoad } from './$types';
import { JUMP_GAMES_URL } from '$app/env/private';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    // Minigames are intrinsic but need the games backend wired up to be usable.
    minigamesAvailable: !!JUMP_GAMES_URL,
  };
};
