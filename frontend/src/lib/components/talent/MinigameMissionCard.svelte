<script lang="ts">
  import type { EligibilityResult } from '$lib/server/services/minigameService';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';

  let { minigame }: { minigame: EligibilityResult } = $props();
</script>

<div
  class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
>
  <div
    class="flex items-center gap-2 border-b border-slate-100 bg-blue-50/50 px-6 py-4 text-xs font-bold text-epi-blue uppercase dark:border-slate-800 dark:bg-blue-950/20"
  >
    <Gamepad2 class="h-4 w-4" />
    Mini-jeu du jour
  </div>

  <div class="p-6">
    {#if minigame.ok}
      <div
        class="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left"
      >
        <div class="flex-1">
          <p
            class="text-sm font-bold text-slate-800 capitalize dark:text-slate-200"
          >
            {minigame.publication.game} · niveau {minigame.publication.level}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Relève le défi du jour et grimpe au classement !
          </p>
        </div>
        <Button
          href={resolve(`/minigames/${minigame.publication.id}`)}
          class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90 sm:w-auto"
        >
          Jouer
        </Button>
      </div>
    {:else if minigame.reason === 'already_played' && minigame.publication}
      <div
        class="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left"
      >
        <div class="flex-1">
          <p class="text-sm font-bold text-slate-800 dark:text-slate-200">
            Déjà joué aujourd'hui !
          </p>
          {#if minigame.lastAttempt}
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {#if minigame.lastAttempt.score !== null && minigame.lastAttempt.score !== undefined}
                Score : {minigame.lastAttempt.score}
              {/if}
              {#if minigame.lastAttempt.chrono}
                {#if minigame.lastAttempt.score !== null && minigame.lastAttempt.score !== undefined}·{/if}
                {(minigame.lastAttempt.chrono / 1000).toFixed(1)}s
              {/if}
            </p>
          {/if}
        </div>
        <Button
          variant="outline"
          href={resolve(`/minigames/${minigame.publication.id}/leaderboard`)}
          class="w-full gap-2 rounded-xl border-slate-200 transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white sm:w-auto dark:border-slate-800 dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
        >
          <Trophy class="h-4 w-4" /> Classement
        </Button>
      </div>
    {/if}
  </div>
</div>
