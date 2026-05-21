<script lang="ts">
  import type { EligibilityResult } from '$lib/server/services/minigameService';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';

  // Slim top strip of the "Mission du jour" card — the daily minigame as one
  // row above the event timeline, not a separate card.
  let { minigame }: { minigame: EligibilityResult } = $props();
</script>

<div
  class="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-blue-50/40 px-6 py-3 dark:border-slate-800 dark:bg-blue-950/20"
>
  <div
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-epi-blue/10 text-epi-blue"
  >
    <Gamepad2 class="h-5 w-5" />
  </div>

  {#if minigame.ok}
    <div class="min-w-0 flex-1">
      <p class="text-[11px] font-bold text-epi-blue uppercase">
        Mini-jeu du jour
      </p>
      <p
        class="truncate text-sm font-semibold text-slate-800 capitalize dark:text-slate-200"
      >
        {minigame.publication.game} · niveau {minigame.publication.level}
      </p>
    </div>
    <Button
      href={resolve(`/minigames/${minigame.publication.id}`)}
      size="sm"
      class="rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90"
    >
      Jouer
    </Button>
  {:else if minigame.reason === 'already_played' && minigame.publication}
    <div class="min-w-0 flex-1">
      <p class="text-[11px] font-bold text-epi-blue uppercase">
        Mini-jeu du jour
      </p>
      <p
        class="truncate text-sm font-semibold text-slate-800 dark:text-slate-200"
      >
        Déjà joué aujourd'hui
        {#if minigame.lastAttempt}
          {#if minigame.lastAttempt.score !== null && minigame.lastAttempt.score !== undefined}
            · {minigame.lastAttempt.score} pts
          {/if}
          {#if minigame.lastAttempt.chrono}
            · {(minigame.lastAttempt.chrono / 1000).toFixed(1)}s
          {/if}
        {/if}
      </p>
    </div>
    <Button
      variant="outline"
      size="sm"
      href={resolve(`/minigames/${minigame.publication.id}/leaderboard`)}
      class="gap-2 rounded-xl border-slate-200 transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white dark:border-slate-800 dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
    >
      <Trophy class="h-4 w-4" /> Classement
    </Button>
  {/if}
</div>
