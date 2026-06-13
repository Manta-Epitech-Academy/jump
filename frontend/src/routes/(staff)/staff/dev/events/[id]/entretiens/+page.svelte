<script lang="ts">
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import EntretiensResults from './components/EntretiensResults.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  const hasCodingClub = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]).has('coding_club'),
  );
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Entretiens</title>
</svelte:head>

<div class="space-y-6 pb-10">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        {
          label: STAGE_SECONDE_LABEL,
          href: resolve(`/staff/dev/events/${data.event.id}`),
        },
        { label: 'Entretiens' },
      ]}
    />
  {/if}
  <PageHeader title="Entretiens" />

  {#await data.cohort}
    <ResultsSkeleton />
  {:then cohort}
    <EntretiensResults
      {...cohort}
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
