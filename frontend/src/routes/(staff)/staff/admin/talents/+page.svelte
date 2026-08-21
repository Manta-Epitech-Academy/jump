<script lang="ts">
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import TalentsResults from './components/TalentsResults.svelte';
  import type { TalentsCohort } from './query';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data } = $props();

  // Resolve the streamed cohort into local state rather than a bare `{#await}`:
  // search, sort and pagination are all server-side, so each one replaces
  // `data.cohort` with a fresh promise. A template `{#await}` would swap back to
  // the skeleton and remount `TalentsResults` on every such navigation, flashing
  // the shell and dropping focus from the search box mid-typing. Holding the last
  // resolved value keeps the table mounted so navigations swap data in place; the
  // skeleton shows only on the first load. The `=== p` guard drops a stale
  // resolution arriving after a newer navigation has started. (Same pattern as
  // the dev émargement table.)
  let cohort = $state<TalentsCohort | null>(null);
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
  {#if cohort}
    <TalentsResults {...cohort} filters={data.filters} />
  {:else if cohortFailed}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Chargement impossible
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        La liste des talents n'a pas pu être chargée. Rechargez la page pour
        réessayer.
      </p>
    </div>
  {:else}
    <ResultsSkeleton rail={false} />
  {/if}
</div>
