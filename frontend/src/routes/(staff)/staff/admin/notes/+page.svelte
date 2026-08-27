<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import NotesResults from './components/NotesResults.svelte';
  import type { NotesCohort } from './query';

  let { data }: { data: PageData } = $props();

  // Resolve the streamed cohort into local state with a stale-promise guard, so a
  // filter/page navigation swaps content in place (no skeleton flash on warm
  // loads) — same pattern as the admin talents directory.
  let cohort = $state<NotesCohort | null>(null);
  let cohortFailed = $state(false);
  $effect(() => {
    const p = data.cohort;
    p.then((d) => {
      if (data.cohort === p) {
        cohort = d;
        cohortFailed = false;
      }
    }).catch(() => {
      if (data.cohort === p) cohortFailed = true;
    });
  });
</script>

<svelte:head>
  <title>Notes — Admin</title>
</svelte:head>

<div class="space-y-6">
  <PageHeader
    title="Notes"
    accent="talents"
    subtitle="Notes du staff sur les talents, tous campus"
  />

  {#if cohort}
    <NotesResults {...cohort} filters={data.filters} />
  {:else if cohortFailed}
    <ResultsNotice
      title="Chargement impossible"
      description="Les notes n'ont pas pu être chargées. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton rail={false} />
  {/if}
</div>
