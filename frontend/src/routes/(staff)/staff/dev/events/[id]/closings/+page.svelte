<script lang="ts">
  import { cohortNounForms, eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import SearchBox from '$lib/components/staff/datatable/SearchBox.svelte';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import ClosingsResults from './components/ClosingsResults.svelte';

  // The search on the title's line, as on Inscrits (the event lists' canon,
  // `.claude/rules/staff-lists.md`), held here for the list under it.
  let { data }: { data: PageData } = $props();

  const search = createUrlSearch();
  const noun = $derived(cohortNounForms(data.event.cohortNoun));
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Closings</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Closings" subtitle={eventDisplayName(data.event)}>
    {#snippet actions()}
      {#if data.rosterSize > 0}
        <SearchBox
          value={search.value}
          onInput={(v) => (search.value = v)}
          placeholder={`Rechercher un ${noun.singular}…`}
          class="w-full md:w-60"
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <ClosingsResults
      {...cohort}
      eventId={data.event.id}
      cohortNoun={data.event.cohortNoun}
      timezone={data.timezone}
      currentStaffId={data.currentStaffId}
      {search}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des closings n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {/await}
</div>
