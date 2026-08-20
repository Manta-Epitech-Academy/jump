<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import MinigameRewardCelebration from '$lib/components/talent/MinigameRewardCelebration.svelte';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Crown from '@lucide/svelte/icons/crown';
  import Home from '@lucide/svelte/icons/home';
  import Info from '@lucide/svelte/icons/info';
  import { minigameRankBonus, minigameRankBonusLimit } from '$lib/domain/xp';

  let { data }: { data: PageData } = $props();

  const isScore = $derived(data.scoringType === 'score');

  // One plain sentence on how the board ranks, so two numbers (score + chrono on
  // scored games) never leave the player guessing which one places them.
  const rankingRule = $derived(
    isScore
      ? 'Classé au score. À égalité, le temps le plus court départage.'
      : 'Classé au temps : le plus rapide en haut.',
  );

  // The bonus pool is cohort-relative (the top slice of the field), so it grows
  // with the board: the podium plus a flat tail out to the current limit. Sized
  // off the field on screen (`rows.length`) so the headline number matches what a
  // talent finishing now would face.
  const fieldSize = $derived(data.rows.length);
  const rankLimit = $derived(minigameRankBonusLimit(fieldSize));

  // The prizes by position, read straight from the XP tiers so the copy can't
  // drift from what's actually paid. We state the rule (not a per-row amount)
  // because the bonus is locked in the moment a talent finishes: the board can
  // move under them afterwards without changing what they already earned, so a
  // fixed per-row "+X" would lie.
  const prizeRule = $derived.by(() => {
    const podium = `1er +${minigameRankBonus(1, fieldSize)} · 2e +${minigameRankBonus(2, fieldSize)} · 3e +${minigameRankBonus(3, fieldSize)}`;
    if (rankLimit <= 3) return `${podium} XP`;
    // Collapse to a single position when the pool opens by exactly one slot, so
    // a board of 31-40 finishers reads "4e", never "4e-4e".
    const tail = rankLimit === 4 ? '4e' : `4e-${rankLimit}e`;
    return `${podium} · ${tail} +${minigameRankBonus(4, fieldSize)} XP`;
  });

  function formatChrono(ms: number | null): string {
    if (ms === null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Minors are involved — show first name + last initial only.
  function displayName(prenom: string, nom: string): string {
    const initial = nom.trim().charAt(0).toUpperCase();
    return initial ? `${prenom} ${initial}.` : prenom;
  }

  // Gold / silver / bronze tint for the three podium positions; everyone else
  // stays neutral. A cue to the current standing only, never a bonus claim.
  function rankColor(rank: number): string {
    if (rank === 1) return 'text-amber-500';
    if (rank === 2) return 'text-slate-400 dark:text-slate-300';
    if (rank === 3) return 'text-amber-700 dark:text-amber-600';
    return 'text-slate-700 dark:text-slate-300';
  }
</script>

<!-- The podium float plays here too, so a player who taps "Voir le classement"
     after a game gets the bonus celebration without first going to the dashboard. -->
<MinigameRewardCelebration rankReward={data.minigameRankReward} />

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Classement" />
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <div
      class="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
    >
      <div class="mb-4 flex items-center gap-3">
        <Trophy class="h-6 w-6 text-epi-together" />
        <div>
          <h1 class="text-xl font-bold">
            {data.publication.gameName} · niveau {data.publication.level}
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {data.campusName
              ? `Classement de ${data.campusName}`
              : 'Classement général'}
          </p>
        </div>
      </div>

      <p
        class="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400"
      >
        {rankingRule}
      </p>

      <p
        class="mb-4 flex items-center gap-1.5 px-1 text-xs font-medium text-epi-together"
      >
        <Crown class="h-3.5 w-3.5 shrink-0" />
        Le top {rankLimit} de ton campus gagne un bonus XP dès la fin de sa partie
        ({prizeRule}). Ton bonus dépend de ton classement quand tu joues, et tu
        le gardes même si d'autres te dépassent ensuite.
      </p>

      {#if data.viewerOutcome === 'lost'}
        <!-- The board lists only winning runs, so a talent who played but didn't
             validate their run is absent from it. Say so plainly, otherwise an
             empty/short board reads as "nobody played" when they just did. -->
        <p
          class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400"
        >
          <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Ta partie n'a pas été validée, tu n'apparais donc pas au classement.
            Reviens demain pour un nouveau défi !
          </span>
        </p>
      {/if}

      {#if data.rows.length === 0}
        <p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Personne n'a encore réussi le défi.
        </p>
      {:else}
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <th class="py-2 text-left font-bold text-slate-400 uppercase"
                >#</th
              >
              <th class="py-2 text-left font-bold text-slate-400 uppercase"
                >Joueur</th
              >
              {#if isScore}
                <th class="py-2 text-right font-bold text-slate-400 uppercase"
                  >Score</th
                >
              {/if}
              <th class="py-2 text-right font-bold text-slate-400 uppercase">
                Chrono{#if isScore}<span class="font-normal normal-case"
                    >&nbsp;· départage</span
                  >{/if}
              </th>
            </tr>
          </thead>
          <tbody>
            {#each data.rows as row}
              <tr
                class="border-b border-slate-50 dark:border-slate-800/50"
                class:bg-orange-50={row.talentId === data.currentTalentId}
                class:dark:bg-orange-950={row.talentId === data.currentTalentId}
              >
                <td class="py-2 font-bold {rankColor(row.rank)}">
                  <span class="inline-flex items-center gap-1.5">
                    {row.rank}
                    {#if row.talentId === data.currentTalentId && row.rankXpAwarded}
                      <!-- Only the connected talent's row shows an amount, and it's
                           the bonus they actually locked in (rankXpAwarded), not a
                           guess from the current rank. -->
                      <span
                        class="inline-flex items-center gap-0.5 rounded-full bg-epi-together/10 px-1.5 py-0.5 text-xs font-semibold text-epi-together"
                        title="Bonus XP que tu as gagné en jouant"
                      >
                        <Crown class="h-3 w-3" />
                        +{row.rankXpAwarded}
                      </span>
                    {/if}
                  </span>
                </td>
                <td class="py-2 text-slate-700 dark:text-slate-300">
                  {displayName(row.prenom, row.nom)}
                  {#if row.talentId === data.currentTalentId}
                    <span class="ml-1 text-xs text-epi-together">(toi)</span>
                  {/if}
                </td>
                {#if isScore}
                  <td
                    class="py-2 text-right font-semibold text-slate-900 dark:text-white"
                  >
                    {row.score ?? '—'}
                  </td>
                {/if}
                <td
                  class="py-2 text-right {isScore
                    ? 'text-slate-400 dark:text-slate-500'
                    : ''}"
                >
                  {formatChrono(row.chrono)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <div class="mt-4 flex justify-center">
      <Button href={resolve('/')} variant="outline" class="w-full sm:w-auto">
        <Home class="mr-2 h-4 w-4" /> Retour à l'accueil
      </Button>
    </div>
  </div>

  <TalentFooter />
</div>
