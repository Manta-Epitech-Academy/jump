<script lang="ts">
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import type { PageData } from './$types';
  import TalentPersonHeader from '$lib/components/students/TalentPersonHeader.svelte';
  import ClosingFlow from '$lib/components/dev/closings/ClosingFlow.svelte';
  import ClosingSectionNav from '$lib/components/dev/closings/ClosingSectionNav.svelte';
  import { eventDisplayName } from '$lib/domain/event';
  import { cn } from '$lib/utils';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import type { ClosingStatus } from '@prisma/client';

  let { data }: { data: PageData } = $props();

  // Lifted so the rail's section nav can jump around while the flow owns the
  // form. Both are local: the answers autosave, so neither needs a DB column.
  // svelte-ignore state_referenced_locally
  let status = $state<ClosingStatus | null>(data.status);
  let step = $state(0);

  // Drives the layout, not just the flow's internals: a finalised closing reads
  // as one column, a closing being conducted keeps its section-nav rail. Tracks
  // the local status so clôture switches the page in the same beat as the flow.
  const isDone = $derived(status === 'done');
</script>

<svelte:head>
  <title>{data.talentName} · Closing</title>
</svelte:head>

{#snippet flow()}
  <ClosingFlow
    form={data.form}
    grid={data.grid}
    synthesisSections={data.synthesisSections}
    retiredAnswers={data.retiredAnswers}
    talentName={data.talentName}
    conductedLabel={data.conductedLabel}
    conductedBy={data.conductedBy}
    conductedByImage={data.conductedByImage}
    bind:status
    bind:step
  />
{/snippet}

<!-- Bounded as a whole once finalised, header included: a synthesis is a document,
     and a header whose "Voir la fiche" sat a thousand pixels from the page it
     heads is not heading anything. While it is being conducted the page keeps the
     full width, because the section-nav rail needs it. -->
<div class={cn('space-y-6 pb-10', isDone && 'max-w-3xl')}>
  <!-- A finalised closing is a document, so the way out sits above the header as
       a plain back bar. In the rail it WAS the rail: the section nav only exists
       while the closing is in progress, so `done` left a third of the page
       carrying two buttons and nothing else. -->
  {#if isDone}
    <a
      href={resolve(`/staff/dev/events/${data.event.id}/closings`)}
      class="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4 shrink-0" />
      Retour à la liste
    </a>
  {/if}

  <!-- This page is about a person, not about a screen, so it is headed like one.
       Under a plain `PageHeader` the name read as a page title and the fiche one
       click away opened on a monogram and a display-face name: the same human,
       twice, with nothing in common. -->
  <!-- What this page is, and on which event. The grid's own label is NOT here:
       a grid is named after the format it serves, so pairing it with the event
       printed "Closing d'orientation - stage de seconde · Stage de Seconde".
       Which questionnaire the closing was conducted with is a fact about the
       record, so it sits with the rest of its provenance, inside the card. -->
  <TalentPersonHeader
    talent={data.talent}
    subtitle="Closing · {eventDisplayName(data.event)}"
    ficheHref={talentFicheHref(data.talentId, data.event.id)}
  />

  {#if isDone}
    {@render flow()}
  {:else}
    <div class="grid gap-6 lg:grid-cols-10">
      <div class="min-w-0 space-y-6 lg:col-span-7">
        {@render flow()}
      </div>

      <div class="lg:col-span-3">
        <div class="space-y-3 lg:sticky lg:top-6">
          {#if status === 'in_progress'}
            <ClosingSectionNav grid={data.grid} bind:step />
          {/if}
          <!-- The way back only. The fiche is reached from the header, which is
               where the person is, rather than from two places at once. -->
          <a
            href={resolve(`/staff/dev/events/${data.event.id}/closings`)}
            class="flex cursor-pointer items-center gap-2 rounded-sm border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <ArrowLeft class="h-4 w-4 shrink-0 text-muted-foreground" />
            Retour à la liste
          </a>
        </div>
      </div>
    </div>
  {/if}
</div>
