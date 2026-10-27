<script lang="ts">
  import CalendarX from '@lucide/svelte/icons/calendar-x';
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import CampusYearGrid from '$lib/components/calendar/CampusYearGrid.svelte';
  import CampusEventList from '$lib/components/calendar/CampusEventList.svelte';
  import CampusCalendarLegend from '$lib/components/calendar/CampusCalendarLegend.svelte';
  import CalendarViewToggle, {
    type CampusCalendarView,
  } from '$lib/components/calendar/CalendarViewToggle.svelte';
  import { selectedEvent } from '$lib/components/dev/selectedEvent';
  import { landingSurface, surfaceSegment } from '$lib/domain/eventModules';

  let { data } = $props();

  let view = $state<CampusCalendarView>('year');
  const selected = selectedEvent();

  /** An event opens on its first page, the one a pick in the menu lands on. */
  const hrefs = $derived(
    new Map(
      data.workspace.events.map((e) => {
        const surface = landingSurface(e);
        return [
          e.id,
          surface
            ? resolve(`/staff/dev/events/${e.id}/${surfaceSegment(surface)}`)
            : null,
        ];
      }),
    ),
  );
  const hrefOf = (id: string) => hrefs.get(id) ?? null;
</script>

<svelte:head>
  <title>Calendrier</title>
</svelte:head>

<div class="space-y-7 pb-10">
  <PageHeader title="Calendrier">
    {#snippet actions()}
      {#if !data.calendar.empty}
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <CampusCalendarLegend legend={data.calendar.legend} />
          <CalendarViewToggle bind:value={view} />
        </div>
      {/if}
    {/snippet}
  </PageHeader>

  {#if data.calendar.empty}
    <ResultsNotice
      icon={CalendarX}
      title="Aucun événement"
      description="Aucun événement de votre campus sur l'année {data.calendar
        .schoolYear}."
    />
  {:else if view === 'year'}
    <CampusYearGrid calendar={data.calendar} {hrefOf} />
  {:else}
    <CampusEventList
      calendar={data.calendar}
      {hrefOf}
      selectedId={selected.id}
    />
  {/if}
</div>
