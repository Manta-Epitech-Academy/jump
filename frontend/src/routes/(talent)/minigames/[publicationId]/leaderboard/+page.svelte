<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Trophy from '@lucide/svelte/icons/trophy';

  let { data }: { data: PageData } = $props();

  function formatChrono(ms: number | null): string {
    if (ms === null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Minors are involved — show first name + last initial only.
  function displayName(prenom: string, nom: string): string {
    const initial = nom.trim().charAt(0).toUpperCase();
    return initial ? `${prenom} ${initial}.` : prenom;
  }
</script>

<div class="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
  <Button variant="ghost" href={resolve('/')}>
    <ArrowLeft class="mr-2 h-4 w-4" /> Retour
  </Button>

  <div
    class="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
  >
    <div class="mb-4 flex items-center gap-3">
      <Trophy class="h-6 w-6 text-epi-orange" />
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

    {#if data.rows.length === 0}
      <p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Personne n'a encore joué.
      </p>
    {:else}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 dark:border-slate-800">
            <th class="py-2 text-left font-bold text-slate-400 uppercase">#</th>
            <th class="py-2 text-left font-bold text-slate-400 uppercase"
              >Joueur</th
            >
            {#if data.scoringType === 'score'}
              <th class="py-2 text-right font-bold text-slate-400 uppercase"
                >Score</th
              >
            {/if}
            <th class="py-2 text-right font-bold text-slate-400 uppercase"
              >Chrono</th
            >
          </tr>
        </thead>
        <tbody>
          {#each data.rows as row}
            <tr
              class="border-b border-slate-50 dark:border-slate-800/50"
              class:bg-orange-50={row.talentId === data.currentTalentId}
              class:dark:bg-orange-950={row.talentId === data.currentTalentId}
            >
              <td class="py-2 font-bold text-slate-700 dark:text-slate-300">
                {row.rank}
              </td>
              <td class="py-2 text-slate-700 dark:text-slate-300">
                {displayName(row.prenom, row.nom)}
                {#if row.talentId === data.currentTalentId}
                  <span class="ml-1 text-xs text-epi-orange">(toi)</span>
                {/if}
              </td>
              {#if data.scoringType === 'score'}
                <td class="py-2 text-right tabular-nums">
                  {row.score ?? '—'}
                </td>
              {/if}
              <td class="py-2 text-right tabular-nums">
                {formatChrono(row.chrono)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
