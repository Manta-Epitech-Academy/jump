<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import Search from '@lucide/svelte/icons/search';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import SfConflictsResults from './components/SfConflictsResults.svelte';
  import type { SfConflictsData } from './components/types';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  // One box (kept in the shell so it's usable while the scans run) filters every
  // tab's list by name or email. Passed down to the results once they resolve.
  let query = $state('');

  // Resolve the streamed scans into local state rather than a bare `{#await}`: the
  // adopt/repair actions re-run the load (which re-runs the heavy scans), and a
  // template `{#await}` would flash the skeleton + remount the tables on every
  // resolution. Holding the last result keeps the tables (and the expanded rows)
  // in place; the skeleton shows only on the first load. The `=== p` guard drops
  // a stale resolution arriving after a newer rescan has started.
  let resolved = $state<SfConflictsData | null>(null);
  let failed = $state(false);
  $effect(() => {
    const p = data.deferred;
    p.then((d) => {
      if (data.deferred === p) {
        resolved = d;
        failed = false;
      }
    }).catch(() => {
      if (data.deferred === p) failed = true;
    });
  });
</script>

<svelte:head>
  <title>Divergences Salesforce</title>
</svelte:head>

<div class="space-y-6">
  <div class="space-y-1">
    <PageHeader title="Divergences" accent="Salesforce" />
    <p class="max-w-3xl text-sm text-muted-foreground">
      Deux familles de divergence : les <strong>données</strong> (Salesforce ⇆
      profil confirmé) et l'<strong>identité de connexion</strong> (le compte d'un
      talent ne porte plus son email).
    </p>
  </div>

  <div class="relative max-w-sm">
    <Search
      class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      bind:value={query}
      placeholder="Rechercher un talent (nom, email)…"
      class="pl-9"
    />
  </div>

  {#if resolved}
    <SfConflictsResults
      diffs={resolved.diffs}
      enrichment={resolved.enrichment}
      authConflicts={resolved.authConflicts}
      lastExportAt={data.lastExportAt}
      {query}
    />
  {:else if failed}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Chargement impossible
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        Les divergences n'ont pas pu être chargées. Rechargez la page pour
        réessayer.
      </p>
    </div>
  {:else}
    <ResultsSkeleton rows={6} rail={false} />
  {/if}
</div>
