<script lang="ts">
  import { cohortNounForms, eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import TitleLineSearch from '$lib/components/staff/datatable/TitleLineSearch.svelte';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import InscritsResults from './components/InscritsResults.svelte';

  // The event's actions (badges, certificates, its Salesforce campaign, the
  // export) live on its home, the mockup's: this page is the list. Its search
  // sits on the title's line rather than stacked above the table (PO,
  // 29/10/2026), held here so the box in the header and the list under it
  // filter on the same query as it is typed.
  let { data }: { data: PageData } = $props();

  const search = createUrlSearch();
  const noun = $derived(cohortNounForms(data.event.cohortNoun));
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader
    title="Inscrits"
    subtitle={eventDisplayName(data.event)}
    class="md:items-start"
  >
    {#snippet actions()}
      {#if data.rosterSize > 0}
        <TitleLineSearch
          {search}
          placeholder={`Rechercher un ${noun.singular}…`}
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <InscritsResults
      {...cohort}
      event={data.event}
      showStatutColumn={data.showStatutColumn}
      {search}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des inscrits n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {/await}
</div>
