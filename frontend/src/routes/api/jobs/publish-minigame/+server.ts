import { cronJob } from '#lib/server/cronJob.ts';
import { pickNextPublication } from '#lib/server/services/minigameService.ts';

export const POST = cronJob('publish-minigame', async () => {
  const publication = await pickNextPublication();
  if (!publication) return { success: false, reason: 'no_eligible_games' };
  console.log(
    `[Job] Minigame published: ${publication.game} level ${publication.level}.`,
  );
  return { success: true, publication };
});
