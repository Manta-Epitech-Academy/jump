<script lang="ts">
  import { resolve } from '$app/paths';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsSkeleton from '$lib/components/staff/ResultsSkeleton.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import EventCategoryChip from '$lib/components/events/EventCategoryChip.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import { ACTION_TILE_CLASS } from '$lib/components/events/actionTile';
  import { EVENT_MODULES } from '$lib/domain/eventModules';
  import type { PageData } from './$types';
  import EventCountdown from './components/EventCountdown.svelte';
  import EventBadgesAction from './components/EventBadgesAction.svelte';
  import EventCertificatesAction from './components/EventCertificatesAction.svelte';
  import HomeFigures, {
    HOME_GRID_CLASS,
  } from './components/home/HomeFigures.svelte';

  // The event's home: where it opens, what it amounts to at a glance, and the
  // actions that act on the whole event. Each figure opens the page it comes
  // from, filtered on it.
  let { data }: { data: PageData } = $props();

  // Badges, certificates and the inscrits sheet all print the cohort, so they
  // answer only where the Inscrits section is on (`loadEventOr404`), and only
  // once there is someone to print: with no inscrit they would hand back an
  // empty document, and the page already says why there is no one. The whole
  // export follows the same rule, since every one of its sheets lists the
  // cohort.
  const hasCohort = $derived(data.rosterSize > 0);
  const printsCohort = $derived(
    data.reachable.includes(EVENT_MODULES.INSCRITS) && hasCohort,
  );
</script>

<svelte:head>
  <title>{data.event.name} · Accueil</title>
</svelte:head>

<div class="space-y-8 pb-10">
  <Tooltip.Provider delayDuration={150}>
    <!-- Top-aligned: the action tiles are taller than the title block, and
         the shared bottom alignment would push the title below where every
         other page sets it. -->
    <PageHeader title={data.event.name} class="md:items-start">
      {#snippet meta()}
        <div class="flex flex-col gap-2">
          <p
            class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground"
          >
            {#if data.event.category}
              <EventCategoryChip category={data.event.category} />
              <span aria-hidden="true">·</span>
            {/if}
            <span>{data.event.days}</span>
            <!-- Labelled here, unlike on the calendar card: right under a
                 countdown in days and hours, a bare « 12 jours » reads as the
                 time left. -->
            <span aria-hidden="true">·</span>
            <span>Durée : {data.event.length}</span>
          </p>
          <EventCountdown
            status={data.countdown.status}
            openDate={data.countdown.openDate}
          />
        </div>
      {/snippet}
      {#snippet actions()}
        <div class="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          {#if printsCohort}
            <EventBadgesAction
              eventId={data.event.id}
              eventName={data.event.name}
              count={data.rosterSize}
            />
            {#if data.diploma}
              <EventCertificatesAction
                eventId={data.event.id}
                eventName={data.event.name}
                label={data.diploma.label}
                count={data.rosterSize}
              />
            {/if}
          {/if}
          <EventSalesforceButton externalId={data.event.externalId} />
          {#if hasCohort && data.exportSections.length > 0}
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    href={resolve(`/staff/dev/events/${data.event.id}/export`)}
                    download
                    variant="outline"
                    class={ACTION_TILE_CLASS}
                  >
                    <FileSpreadsheet />
                    Exporter Excel
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="max-w-64">
                Tout l'événement, une feuille par section : {data.exportSections.join(
                  ', ',
                )}.
              </Tooltip.Content>
            </Tooltip.Root>
          {/if}
        </div>
      {/snippet}
    </PageHeader>
  </Tooltip.Provider>

  {#await data.figures}
    <ResultsSkeleton>
      {#snippet shape()}
        <div class={HOME_GRID_CLASS}>
          {#each Array.from({ length: 9 }, (_, i) => i) as i (i)}
            <Skeleton class="h-80 w-full" />
          {/each}
        </div>
      {/snippet}
    </ResultsSkeleton>
  {:then figures}
    <HomeFigures
      {figures}
      eventId={data.event.id}
      cohortNoun={data.event.cohortNoun}
      reachable={data.reachable}
    />
  {:catch}
    <ResultsNotice
      title="Chargement impossible"
      description="Les chiffres de l'événement n'ont pas pu être chargés. Rechargez la page pour réessayer."
    />
  {/await}
</div>
