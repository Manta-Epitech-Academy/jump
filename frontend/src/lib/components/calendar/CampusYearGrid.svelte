<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import type {
    CalendarCell,
    CalendarEvent,
    CampusCalendar,
  } from '$lib/domain/campusCalendar';
  import CalendarEventStatus from './CalendarEventStatus.svelte';

  // The year view of the 2027 mockup: twelve small months, each event a band of
  // its category's colour across its days, the days without school greyed. The
  // layout is decided in `buildCampusCalendar`; this only paints it.
  let {
    calendar,
    hrefOf,
  }: {
    calendar: CampusCalendar;
    /** Where an event opens, or null when it has no page to open on. */
    hrefOf: (id: string) => string | null;
  } = $props();

  const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  /** Rounded only where the run starts or ends, so a band reads as one shape. */
  const runCorners = (run: { startsRun: boolean; endsRun: boolean }) =>
    cn(run.startsRun && 'rounded-l-md', run.endsRun && 'rounded-r-md');

  const eventsOf = (cell: CalendarCell): CalendarEvent[] =>
    cell.eventIds.map((id) => calendar.events[id]);

  const enrolmentsLabel = (n: number) =>
    `${n} ${n > 1 ? 'inscrits' : 'inscrit'}`;
</script>

{#snippet eventTip(cell: CalendarCell)}
  <div class="flex w-60 flex-col gap-3 py-2">
    {#each eventsOf(cell) as event (event.id)}
      <div class="flex flex-col gap-1.5">
        <span class="inline-flex items-center gap-2 epi-overline opacity-80">
          {#if event.category}
            <span
              aria-hidden="true"
              class="size-2.5 shrink-0 rounded-sm bg-[var(--category-color)]"
              style:--category-color={event.category.color}
            ></span>
            {event.category.label}
          {:else}
            Sans catégorie
          {/if}
        </span>
        <span class="font-heading text-display-s">{event.name}</span>
        <span class="text-sm opacity-80">{event.daysLabelLong}</span>
        <span class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs">
            {enrolmentsLabel(event.shownEnrolments)}
          </span>
          <CalendarEventStatus {event} inverse />
        </span>
      </div>
    {/each}
    {#if cell.painted && hrefOf(cell.painted.id)}
      <span
        class="border-t border-background/20 pt-2.5 epi-overline opacity-80"
      >
        Cliquer pour ouvrir →
      </span>
    {/if}
  </div>
{/snippet}

<Tooltip.Provider delayDuration={100}>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
    {#each calendar.months as month (month.key)}
      <section
        aria-label="{month.name} {month.year}"
        class="flex flex-col rounded-sm border bg-card"
      >
        <header
          class="flex items-center justify-between border-b px-4 pt-3.5 pb-2.5"
        >
          <span class="epi-overline">
            {month.name}
            <span class="font-normal text-muted-foreground">{month.year}</span>
          </span>
          <span
            class={cn(
              'font-mono text-xs',
              month.isCurrent ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {#if month.isCurrent}
              AUJOURD'HUI
            {:else if month.eventCount}
              {month.eventCount} évt
            {/if}
          </span>
        </header>
        <div class="px-3 pt-2.5 pb-3.5">
          <div
            aria-hidden="true"
            class="grid grid-cols-7 pb-1 text-center font-mono text-overline text-muted-foreground"
          >
            {#each WEEKDAYS as weekday, i (i)}<span>{weekday}</span>{/each}
          </div>
          <div class="grid grid-cols-7 gap-y-1">
            {#each { length: month.leadingBlanks }, i (i)}<span></span>{/each}
            {#each month.cells as cell (cell.day)}
              {#if cell.painted}
                {@const event = calendar.events[cell.painted.id]}
                {@const href = hrefOf(event.id)}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <svelte:element
                        this={href ? 'a' : 'span'}
                        {...props}
                        {href}
                        aria-label="{event.name}, {event.daysLabel}"
                        class={cn(
                          'flex h-7.5 w-full items-center justify-center font-mono text-xs font-bold',
                          href && 'cursor-pointer',
                          runCorners(cell.painted!),
                          event.fill
                            ? 'bg-[var(--category-color)]'
                            : 'bg-muted-foreground text-background',
                          event.fill?.ink === 'light' && 'text-white',
                          event.fill?.ink === 'dark' && 'text-epi-dark',
                        )}
                        style:--category-color={event.fill?.color}
                      >
                        {cell.dayOfMonth}
                      </svelte:element>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content>{@render eventTip(cell)}</Tooltip.Content>
                </Tooltip.Root>
              {:else}
                {@const day = cell}
                {#snippet plain(props: Record<string, unknown> = {})}
                  <span
                    {...props}
                    class={cn(
                      'flex h-7.5 items-center justify-center font-mono text-xs',
                      day.off && 'bg-muted',
                      day.off && runCorners(day.off),
                    )}
                  >
                    <span
                      class={cn(
                        'flex size-6.5 items-center justify-center rounded-full',
                        day.today && 'bg-foreground font-bold text-background',
                        !day.today &&
                          day.weekend &&
                          !day.off &&
                          'text-muted-foreground',
                      )}
                    >
                      {day.dayOfMonth}
                    </span>
                  </span>
                {/snippet}
                {#if day.off}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        {@render plain(props)}
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>{day.off.name}</Tooltip.Content>
                  </Tooltip.Root>
                {:else}
                  {@render plain()}
                {/if}
              {/if}
            {/each}
          </div>
        </div>
      </section>
    {/each}
  </div>
</Tooltip.Provider>
