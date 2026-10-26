<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import EventCategoryChip from '$lib/components/events/EventCategoryChip.svelte';
  import { cn } from '$lib/utils';
  import type { CampusCalendar } from '$lib/domain/campusCalendar';
  import CalendarEventStatus from './CalendarEventStatus.svelte';

  // The list view of the 2027 mockup: the school year's events by date, grouped
  // by month, each row opening its event. Wide on purpose (six columns), so on
  // a phone it scrolls sideways inside its own box, as the mockup does.
  let {
    calendar,
    hrefOf,
    selectedId,
  }: {
    calendar: CampusCalendar;
    hrefOf: (id: string) => string | null;
    /** The event the menu names as selected, highlighted here too. */
    selectedId: string | null;
  } = $props();

  const enrolmentsLabel = (n: number) =>
    `${n} ${n > 1 ? 'inscrits' : 'inscrit'}`;
</script>

<div class="overflow-x-auto rounded-sm border bg-card">
  <div class="min-w-160">
    {#each calendar.list as group (group.key)}
      <h2
        class="border-b bg-muted/40 px-5 pt-3.5 pb-2.5 epi-overline text-foreground"
      >
        {group.name}
        <span class="font-normal text-muted-foreground">{group.year}</span>
      </h2>
      {#each group.events as row (row.id)}
        {@const event = calendar.events[row.id]}
        {@const href = hrefOf(event.id)}
        <svelte:element
          this={href ? 'a' : 'div'}
          {href}
          aria-current={event.id === selectedId ? 'true' : undefined}
          class={cn(
            'grid min-h-17 w-full grid-cols-[4.5rem_minmax(0,1fr)_9.5rem_7rem_7rem_1.75rem] items-center gap-4 border-b px-5 text-left',
            href && 'cursor-pointer transition-colors hover:bg-accent',
            event.id === selectedId && 'bg-accent',
          )}
        >
          <span class="flex flex-col items-start">
            <span class="font-heading text-display-m">
              {String(row.dayOfMonth).padStart(2, '0')}
            </span>
            <span
              class="font-mono text-overline text-muted-foreground uppercase"
            >
              {row.weekday}
            </span>
          </span>
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="truncate text-base font-semibold">{event.name}</span>
            <span class="text-sm text-muted-foreground">{event.daysLabel}</span>
          </span>
          <span class="min-w-0 text-sm">
            {#if event.category}
              <EventCategoryChip category={event.category} />
            {:else}
              <span class="text-muted-foreground">Sans catégorie</span>
            {/if}
          </span>
          <span class="font-mono text-sm">
            {enrolmentsLabel(event.shownEnrolments)}
          </span>
          <CalendarEventStatus {event} />
          {#if href}
            <ChevronRight class="size-4.5 text-muted-foreground" />
          {/if}
        </svelte:element>
      {/each}
    {/each}
  </div>
</div>
