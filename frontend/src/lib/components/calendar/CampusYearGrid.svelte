<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import { FILL_INKS } from '$lib/design/color';
  import type {
    CalendarCell,
    CalendarEvent,
    CampusCalendar,
  } from '$lib/domain/campusCalendar';
  import CalendarEventStatus from './CalendarEventStatus.svelte';

  // The year view of the 2027 mockup: twelve small months, each event a band of
  // its category's colour across its days, the days without school greyed. The
  // layout is decided in `buildCampusCalendar`; this only paints it.
  //
  // A click on an event's day opens a card beside it, as a calendar app does:
  // what the event is, and a real button to open it. The mockup showed that
  // card as a hover tooltip saying « Cliquer pour ouvrir », which invited a
  // click on the tooltip, where nothing can be clicked; and a tooltip does not
  // exist under a finger. Hover only lights the whole band of the day's event,
  // on every week and month it crosses, so the pointer finds a shape to click.
  //
  // Two events can share a day. The band is the longest one's, a dot in the
  // corner stands for each other, and the card holds each of them with its own
  // button, so the one behind is never out of reach.
  let {
    calendar,
    hrefOf,
  }: {
    calendar: CampusCalendar;
    /** Where an event opens: its home. */
    hrefOf: (id: string) => string;
  } = $props();

  const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  /** Rounded only where the run starts or ends, so a band reads as one shape. */
  const runCorners = (run: { startsRun: boolean; endsRun: boolean }) =>
    cn(run.startsRun && 'rounded-l-md', run.endsRun && 'rounded-r-md');

  /**
   * A band's outline, drawn round the run and not between its days. A category
   * colour is the team's choice, so it can match the card it sits on (a white
   * one in the light theme, a near-black one in the dark): the edge is the fill
   * shaded toward the text colour, which parts any fill from either ground.
   */
  const runEdges = (run: { startsRun: boolean; endsRun: boolean }) =>
    cn(
      'border-y border-[color-mix(in_oklab,var(--band-color),var(--foreground)_25%)]',
      run.startsRun && 'border-l',
      run.endsRun && 'border-r',
    );

  const eventsOf = (cell: CalendarCell): CalendarEvent[] =>
    cell.eventIds.map((id) => calendar.events[id]);

  /** An event's fill and the ink on it, an uncategorised one on neutral tokens. */
  const bandOf = (event: CalendarEvent) =>
    event.fill
      ? { color: event.fill.color, ink: FILL_INKS[event.fill.ink] }
      : { color: 'var(--muted-foreground)', ink: 'var(--background)' };

  const enrolmentsLabel = (n: number) =>
    `${n} ${n > 1 ? 'inscrits' : 'inscrit'}`;

  /** The day under the pointer or focus, the day whose card is open, and the
      events whose bands they light. */
  let pointed = $state.raw<CalendarCell | null>(null);
  let opened = $state.raw<CalendarCell | null>(null);
  const lit = $derived([
    ...(pointed?.eventIds ?? []),
    ...(opened?.eventIds ?? []),
  ]);
  const lights = (cell: CalendarCell) => ({
    onpointerenter: () => (pointed = cell),
    onpointerleave: () => (pointed = null),
    onfocus: () => (pointed = cell),
    onblur: () => (pointed = null),
  });
</script>

{#snippet eventCard(cell: CalendarCell)}
  <ul class="max-h-[40svh] divide-y overflow-y-auto">
    {#each eventsOf(cell) as event (event.id)}
      {@const href = hrefOf(event.id)}
      <li class="flex flex-col gap-1.5 p-4">
        <span class="inline-flex items-center gap-2 epi-overline">
          <span
            aria-hidden="true"
            class="size-2.5 shrink-0 rounded-sm border border-border bg-[var(--band-color)]"
            style:--band-color={bandOf(event).color}
          ></span>
          {event.category?.label ?? 'Sans catégorie'}
        </span>
        <span class="font-heading text-display-s">{event.name}</span>
        <span class="text-sm text-muted-foreground">{event.daysLabelLong}</span>
        <span class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs">
            {enrolmentsLabel(event.shownEnrolments)}
          </span>
          <CalendarEventStatus {event} />
        </span>
        <Button {href} size="sm" class="mt-2 w-full">
          Ouvrir l'événement
          <ArrowRight />
        </Button>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet eventDay(
  cell: CalendarCell,
  painted: NonNullable<CalendarCell['painted']>,
  monthName: string,
)}
  {@const event = calendar.events[painted.id]}
  {@const others = cell.eventIds.slice(1)}
  <Popover.Root
    onOpenChange={(open) => {
      if (open) opened = cell;
      else if (opened === cell) opened = null;
    }}
  >
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...mergeProps(props, lights(cell))}
          type="button"
          aria-label="{cell.dayOfMonth} {monthName} : {eventsOf(cell)
            .map((e) => e.name)
            .join(', ')}"
          class={cn(
            'relative flex h-7.5 w-full cursor-pointer items-center justify-center font-mono text-xs font-bold text-[var(--band-ink)] transition-colors',
            runCorners(painted),
            runEdges(painted),
            lit.includes(event.id)
              ? 'bg-[color-mix(in_oklab,var(--band-color),var(--band-ink)_25%)]'
              : 'bg-[var(--band-color)]',
          )}
          style:--band-color={bandOf(event).color}
          style:--band-ink={bandOf(event).ink}
        >
          {cell.dayOfMonth}
          {#if others.length}
            <span
              aria-hidden="true"
              class="absolute top-0.5 right-0.5 flex gap-0.5"
            >
              {#each others.slice(0, 3) as id (id)}
                <span
                  class="size-1.5 rounded-full bg-[var(--band-color)] ring-1 ring-card"
                  style:--band-color={bandOf(calendar.events[id]).color}
                ></span>
              {/each}
            </span>
          {/if}
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content align="start" class="p-0">
      {@render eventCard(cell)}
    </Popover.Content>
  </Popover.Root>
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
                {@render eventDay(cell, cell.painted, month.name)}
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
