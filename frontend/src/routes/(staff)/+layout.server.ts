import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    featureFlags: [...locals.featureFlags],
    // Minigames are intrinsic but need the games backend wired up to be usable.
    minigamesAvailable: !!env.JUMP_GAMES_URL,
  };
};
