<script lang="ts">
  import type {
    EligibilityResult,
    LeaderboardPreview,
    LeaderboardRow,
  } from '$lib/server/services/minigameService';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  // The daily minigame as its own card: pre-play shows the "Jouer" CTA, and
  // once played the body morphs into the campus leaderboard for *this* game —
  // both under the same game header, so the ranking's context is unambiguous.
  let {
    minigame,
    leaderboard,
    currentTalentId,
  }: {
    minigame: EligibilityResult;
    leaderboard: (LeaderboardPreview & { publicationId: string }) | null;
    currentTalentId: string;
  } = $props();

  // Present in both the playable and already-played states.
  let publication = $derived(minigame.publication);
  let played = $derived(!minigame.ok && minigame.reason === 'already_played');
  let lastAttempt = $derived(minigame.ok ? null : minigame.lastAttempt);

  function displayName(prenom: string, nom: string): string {
    const initial = nom.trim().charAt(0).toUpperCase();
    return initial ? `${prenom} ${initial}.` : prenom;
  }

  function formatChrono(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
  }
</script>

{#if publication}
  <div
    class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
  >
    <div
      class="flex flex-wrap items-center gap-x-2 border-b border-slate-100 bg-blue-50/50 px-6 py-4 dark:border-slate-800 dark:bg-blue-950/20"
    >
      <Gamepad2 class="h-4 w-4 text-epi-blue" />
      <span class="text-xs font-bold text-epi-blue uppercase">
        Mini-jeu du jour
      </span>
      <span class="text-slate-300 dark:text-slate-700">•</span>
      <span class="text-xs font-bold text-slate-500 capitalize">
        {publication.game} · niveau {publication.level}
      </span>
    </div>

    {#if !played}
      <!-- Playable: CTA -->
      <div
        class="flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:text-left"
      >
        <p class="flex-1 text-sm text-slate-500 dark:text-slate-400">
          Relève le défi du jour et grimpe au classement !
        </p>
        <Button
          href={resolve(`/minigames/${publication.id}`)}
          class="w-full rounded-xl bg-epi-blue font-bold text-white hover:bg-epi-blue/90 sm:w-auto"
        >
          Jouer
        </Button>
      </div>
    {:else}
      <!-- Played: morph into the leaderboard for this game -->
      <div class="p-4">
        {#if lastAttempt && (lastAttempt.score !== null || lastAttempt.chrono !== null)}
          <p class="px-2 pb-2 text-xs font-bold text-slate-400 uppercase">
            Ton résultat :
            {#if lastAttempt.score !== null}{lastAttempt.score} pts{/if}
            {#if lastAttempt.score !== null && lastAttempt.chrono !== null}·{/if}
            {#if lastAttempt.chrono !== null}{formatChrono(
                lastAttempt.chrono,
              )}{/if}
          </p>
        {/if}

        {#if leaderboard && leaderboard.rows.length > 0}
          {#snippet rowLine(row: LeaderboardRow, pinned: boolean)}
            {@const isMe = row.talentId === currentTalentId}
            <div
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm {isMe
                ? 'bg-orange-50 dark:bg-orange-950/30'
                : ''} {pinned
                ? 'mt-1 border-t border-dashed border-slate-200 dark:border-slate-800'
                : ''}"
            >
              <span
                class="w-6 shrink-0 text-center font-bold text-slate-400 tabular-nums"
              >
                {row.rank}
              </span>
              <span
                class="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300"
              >
                {displayName(row.prenom, row.nom)}
                {#if isMe}
                  <span class="ml-1 text-xs font-bold text-epi-orange">
                    (toi)
                  </span>
                {/if}
              </span>
              <span class="shrink-0 font-semibold tabular-nums">
                {#if leaderboard.scoringType === 'score'}
                  {row.score ?? '—'}
                {:else}
                  {formatChrono(row.chrono)}
                {/if}
              </span>
            </div>
          {/snippet}

          <div class="space-y-0.5">
            {#each leaderboard.rows as row (row.talentId)}
              {@render rowLine(row, false)}
            {/each}
            {#if leaderboard.ownRow}
              {@render rowLine(leaderboard.ownRow, true)}
            {/if}
          </div>

          {#if leaderboard.total > leaderboard.rows.length}
            <a
              href={resolve(
                `/minigames/${leaderboard.publicationId}/leaderboard`,
              )}
              class="mt-3 flex items-center justify-center gap-1 text-xs font-bold text-epi-blue hover:underline"
            >
              Voir le classement complet ({leaderboard.total})
              <ArrowRight class="h-3.5 w-3.5" />
            </a>
          {/if}
        {:else}
          <p
            class="px-2 py-4 text-center text-sm text-slate-500 dark:text-slate-400"
          >
            <Trophy class="mx-auto mb-2 h-5 w-5 text-epi-orange" />
            Personne n'a encore terminé. Sois le premier au classement !
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
