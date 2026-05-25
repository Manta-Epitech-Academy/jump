<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';

  let { data }: { data: PageData } = $props();

  function formatChrono(ms: number | null): string {
    if (ms === null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<svelte:head>
  <title>{data.event.titre} — Mini-jeux</title>
</svelte:head>

<div class="flex flex-col space-y-6">
  <div class="border-b pb-4">
    <PageBreadcrumb
      items={[
        {
          label: data.event.titre,
          href: resolve(`/staff/pedago/events/${data.event.id}`),
        },
        { label: 'Mini-jeux' },
      ]}
    />
    <h1
      class="flex items-center gap-3 text-3xl font-bold text-epi-blue uppercase"
    >
      <Gamepad2 class="h-7 w-7" />
      Mini-jeux<span class="text-foreground">_</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      {data.event.titre}
    </p>
  </div>

  <section class="rounded-xl border bg-card p-6">
    <div class="mb-4 flex items-center gap-3">
      <Trophy class="h-5 w-5 text-epi-orange" />
      <h2 class="text-lg font-bold">Classement</h2>
    </div>
    {#if !data.publication}
      <p class="text-sm text-muted-foreground">
        Aucune publication active pour le moment.
      </p>
    {:else}
      <p class="mb-3 text-sm text-muted-foreground">
        Publication active : <span>{data.publication.gameName}</span>
        · niveau {data.publication.level}
      </p>
      {#if data.leaderboard.rows.length === 0}
        <p class="text-sm text-muted-foreground">Personne n'a encore joué.</p>
      {:else}
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="py-2 text-left font-bold uppercase">#</th>
              <th class="py-2 text-left font-bold uppercase">Joueur</th>
              {#if data.leaderboard.scoringType === 'score'}
                <th class="py-2 text-right font-bold uppercase">Score</th>
              {/if}
              <th class="py-2 text-right font-bold uppercase">Chrono</th>
            </tr>
          </thead>
          <tbody>
            {#each data.leaderboard.rows as row (row.talentId)}
              <tr class="border-b border-muted">
                <td class="py-2 font-bold">{row.rank}</td>
                <td class="py-2">{row.prenom} {row.nom}</td>
                {#if data.leaderboard.scoringType === 'score'}
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
    {/if}
  </section>
</div>
