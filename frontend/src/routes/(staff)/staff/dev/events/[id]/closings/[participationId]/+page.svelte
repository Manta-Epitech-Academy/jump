<script lang="ts">
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ClosingFlow from '$lib/components/dev/closings/ClosingFlow.svelte';
  import ClosingSectionNav from '$lib/components/dev/closings/ClosingSectionNav.svelte';
  import { eventDisplayName } from '$lib/domain/event';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import type { ClosingStatus } from '@prisma/client';

  let { data }: { data: PageData } = $props();

  // Lifted so the rail's section nav can jump around while the flow owns the
  // form. Both are local: the answers autosave, so neither needs a DB column.
  // svelte-ignore state_referenced_locally
  let status = $state<ClosingStatus | null>(data.status);
  let step = $state(0);
</script>

<svelte:head>
  <title>{data.talentName} · Closing</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader
    title={data.talentName}
    subtitle="{data.grid.label} · {eventDisplayName(data.event)}"
  />

  <div class="grid gap-6 lg:grid-cols-10">
    <div class="space-y-6 lg:col-span-7">
      <ClosingFlow
        form={data.form}
        grid={data.grid}
        talentName={data.talentName}
        conductedLabel={data.conductedLabel}
        conductedBy={data.conductedBy}
        conductedByImage={data.conductedByImage}
        bind:status
        bind:step
      />
    </div>

    <div class="lg:col-span-3">
      <div class="space-y-3 lg:sticky lg:top-6">
        {#if status === 'in_progress'}
          <ClosingSectionNav grid={data.grid} bind:step />
        {/if}
        <a
          href={resolve(`/staff/dev/events/${data.event.id}/closings`)}
          class="flex cursor-pointer items-center gap-2 rounded-sm border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft class="h-4 w-4 shrink-0 text-muted-foreground" />
          Retour à la liste
        </a>
        <a
          href={talentFicheHref(data.talentId, data.event.id)}
          class="flex cursor-pointer items-center gap-2 rounded-sm border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          Voir la fiche de {data.talentName}
        </a>
      </div>
    </div>
  </div>
</div>
