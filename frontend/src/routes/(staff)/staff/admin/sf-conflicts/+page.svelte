<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import Search from '@lucide/svelte/icons/search';
  import { createStreamedCohort } from '$lib/components/staff/streamedCohort.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import SfConflictsResults from './components/SfConflictsResults.svelte';
  import type { SfConflictsData } from './components/types';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  // One box (kept in the shell so it's usable while the scans run) filters every
  // tab's list by name or email. Passed down to the results once they resolve.
  let query = $state('');

  // The adopt/repair actions re-run the load, and with it the heavy scans, so
  // each one hands `data.deferred` a fresh promise: the tables (and their
  // expanded rows) are held across them rather than re-awaited. See
  // `createStreamedCohort`.
  const scans = createStreamedCohort<SfConflictsData>(() => data.deferred);
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

  {#if scans.value}
    <SfConflictsResults
      diffs={scans.value.diffs}
      enrichment={scans.value.enrichment}
      authConflicts={scans.value.authConflicts}
      lastExportAt={data.lastExportAt}
      {query}
    />
  {:else if scans.failed}
    <ResultsNotice
      title="Chargement impossible"
      description="Les divergences n'ont pas pu être chargées. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton rows={6} rail={false} />
  {/if}
</div>
