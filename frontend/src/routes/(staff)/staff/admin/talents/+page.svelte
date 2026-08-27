<script lang="ts">
  import { createStreamedCohort } from '$lib/components/staff/streamedCohort.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import TalentsResults from './components/TalentsResults.svelte';
  import type { TalentsCohort } from './query';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  // Search, sort and pagination are all server-side here, so each one replaces
  // `data.cohort` with a fresh promise: the table has to be held across them
  // rather than re-awaited. See `createStreamedCohort` for why.
  const cohort = createStreamedCohort<TalentsCohort>(() => data.cohort);
</script>

<svelte:head>
  <title>Talents</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <PageHeader
      title="Talents"
      accroche="se connecter en tant qu'un talent pour voir son espace"
    />
  </div>

  <!-- Stream the cohort behind the heading: the page chrome paints instantly
       while the row page + the six scoped KPI counts resolve. The toolbar and
       filters live inside the streamed region (they need the cohort). Once
       resolved, the table stays mounted so server-side search / sort / paging
       swap data in place instead of reflashing the skeleton. -->
  {#if cohort.value}
    <TalentsResults {...cohort.value} filters={data.filters} />
  {:else if cohort.failed}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des talents n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {:else}
    <ResultsSkeleton rail={false} />
  {/if}
</div>
