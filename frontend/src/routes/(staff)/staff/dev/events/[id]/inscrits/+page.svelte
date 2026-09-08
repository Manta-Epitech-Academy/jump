<script lang="ts">
  import { eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import InscritsResults from './components/InscritsResults.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Inscrits" subtitle={eventDisplayName(data.event)}>
    {#snippet actions()}
      <EventSalesforceButton externalId={data.event.externalId} />
    {/snippet}
  </PageHeader>

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <InscritsResults
      {...cohort}
      origin={data.origin}
      countdown={data.countdown}
      timezone={data.timezone}
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
