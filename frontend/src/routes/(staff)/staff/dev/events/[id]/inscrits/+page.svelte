<script lang="ts">
  import { eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import InscritsResults from './components/InscritsResults.svelte';

  // The event's actions (badges, certificates, its Salesforce campaign, the
  // whole export) live on its home, the mockup's: this page is the list.
  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Inscrits" subtitle={eventDisplayName(data.event)} />

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <InscritsResults
      {...cohort}
      event={data.event}
      showStatutColumn={data.showStatutColumn}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des inscrits n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {/await}
</div>
