<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { createStreamedCohort } from '$lib/components/staff/streamedCohort.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import NotesResults from './components/NotesResults.svelte';
  import type { NotesCohort } from './query';

  let { data }: { data: PageData } = $props();

  // Filters and paging are server-side, so each one replaces `data.cohort`: the
  // list is held across them rather than re-awaited. See `createStreamedCohort`.
  const cohort = createStreamedCohort<NotesCohort>(() => data.cohort);
</script>

<svelte:head>
  <title>Notes - Admin</title>
</svelte:head>

<div class="space-y-6">
  <PageHeader
    title="Notes"
    accent="talents"
    subtitle="Notes du staff sur les talents, tous campus"
  />

  {#if cohort.value}
    <NotesResults {...cohort.value} filters={data.filters} />
  {:else if cohort.failed}
    <ResultsNotice
      title="Chargement impossible"
      description="Les notes n'ont pas pu être chargées. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton rail={false} />
  {/if}
</div>
