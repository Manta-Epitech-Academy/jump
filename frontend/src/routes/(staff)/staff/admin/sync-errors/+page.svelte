<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import SyncErrorsResults from './components/SyncErrorsResults.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Erreurs de sync</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader
    title="Erreurs de"
    accent="Sync"
    subtitle="Ce que la synchronisation Salesforce n'arrive pas à faire en ce moment"
  />

  {#await data.queue}
    <ResultsSkeleton />
  {:then rows}
    <SyncErrorsResults {rows} />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="Les erreurs de synchronisation n'ont pas pu être chargées. Rechargez la page pour réessayer."
    />
  {/await}
</div>
