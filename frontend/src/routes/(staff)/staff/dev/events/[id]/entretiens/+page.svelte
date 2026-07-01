<script lang="ts">
  import { eventDisplayName } from '$lib/domain/event';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import EntretiensResults from './components/EntretiensResults.svelte';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  const hasCodingClub = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]).has('coding_club'),
  );
</script>

<svelte:head>
  <title>{eventDisplayName(data.event)} · Entretiens</title>
</svelte:head>

<div class="space-y-6 pb-10">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[{ label: eventDisplayName(data.event) }, { label: 'Entretiens' }]}
    />
  {/if}
  <PageHeader title="Entretiens" />

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <EntretiensResults
      {...cohort}
      eventId={data.event.id}
      cohortNoun={data.event.cohortNoun}
      timezone={data.timezone}
      currentStaffId={data.currentStaffId}
    />
  {:catch}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <h3 class="text-sm font-bold tracking-widest text-foreground uppercase">
        Chargement impossible
      </h3>
      <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
        La liste des entretiens n'a pas pu être chargée. Rechargez la page pour
        réessayer.
      </p>
    </div>
  {/await}
</div>
