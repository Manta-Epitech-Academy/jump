<script lang="ts">
  import { eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import ClosingsResults from './components/ClosingsResults.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Closings</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Closings" subtitle={eventDisplayName(data.event)} />

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <ClosingsResults
      {...cohort}
      eventId={data.event.id}
      cohortNoun={data.event.cohortNoun}
      timezone={data.timezone}
      currentStaffId={data.currentStaffId}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des closings n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {/await}
</div>
