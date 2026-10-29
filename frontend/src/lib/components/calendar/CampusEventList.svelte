<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import EventCategoryChip from '$lib/components/events/EventCategoryChip.svelte';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import type { CampusCalendar } from '$lib/domain/campusCalendar';
  import CalendarEventStatus from './CalendarEventStatus.svelte';

  // The list view of the 2027 mockup: the school year's events by date, grouped
  // by month, each row opening its event. Wide on purpose (six columns), so on
  // a phone it scrolls sideways inside its own box, as the mockup does.
  //
  // The whole row opens its event through the name's link, stretched over the
  // row, so the Salesforce glyph beside the name stays a control of its own: a
  // read-only glance at the campaign behind the public name, never a link.
  let {
    calendar,
    hrefOf,
    selectedId,
  }: {
    calendar: CampusCalendar;
    /** Where an event opens: its home. */
    hrefOf: (id: string) => string;
    /** The event the menu names as selected, highlighted here too. */
    selectedId: string | null;
  } = $props();

  const enrolmentsLabel = (n: number) =>
    `${n} ${n > 1 ? 'inscrits' : 'inscrit'}`;
</script>

<Tooltip.Provider delayDuration={150}>
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
          <div
            class={cn(
              'relative grid min-h-17 w-full grid-cols-[4.5rem_minmax(0,1fr)_9.5rem_7rem_7rem_1.75rem] items-center gap-4 border-b px-5 transition-colors hover:bg-accent',
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
              <span class="flex min-w-0 items-center gap-2">
                <a
                  {href}
                  aria-current={event.id === selectedId ? 'true' : undefined}
                  class="cursor-pointer truncate text-base font-semibold after:absolute after:inset-0"
                >
                  {event.name}
                </a>
                {#if event.campaign}
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      type="button"
                      aria-label="Voir le nom de la campagne Salesforce"
                      class="relative z-10 flex shrink-0 cursor-help items-center rounded-sm p-0.5 transition-opacity hover:opacity-70"
                    >
                      <SalesforceIcon class="size-3.5" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>{event.campaign}</Tooltip.Content>
                  </Tooltip.Root>
                {/if}
              </span>
              <span class="text-sm text-muted-foreground"
                >{event.daysLabel}</span
              >
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
            <ChevronRight class="size-4.5 text-muted-foreground" />
          </div>
        {/each}
      {/each}
    </div>
  </div>
</Tooltip.Provider>
