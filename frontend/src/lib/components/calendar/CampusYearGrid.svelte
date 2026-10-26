<script lang="ts">
  import { mergeProps } from 'bits-ui';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import { FILL_INKS } from '$lib/design/color';
  import type {
    CalendarCell,
    CalendarEvent,
    CalendarMonth,
    CampusCalendar,
  } from '$lib/domain/campusCalendar';
  import CalendarEventStatus from './CalendarEventStatus.svelte';

  // The year view of the 2027 mockup: twelve small months, each event a band of
  // its category's colour across its days, the days without school greyed. The
  // layout is decided in `buildCampusCalendar`; this only paints it.
  //
  // The day under the pointer is what a click opens, so that is where the
  // feedback goes: the whole band of its event lights up, on every week and
  // month it crosses. The tooltip only describes; it holds nothing to click,
  // and closes as soon as the pointer leaves the day.
  //
  // Two events can share a day. The band is the longest one's, a dot in the
  // corner stands for each other, and the day opens a short list to pick from
  // rather than opening one of them behind the other's back.
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

  /** An event's fill and the ink on it, an uncategorised one on neutral tokens. */
  const bandOf = (event: CalendarEvent) =>
    event.fill
      ? { color: event.fill.color, ink: FILL_INKS[event.fill.ink] }
      : { color: 'var(--muted-foreground)', ink: 'var(--background)' };

  const enrolmentsLabel = (n: number) =>
    `${n} ${n > 1 ? 'inscrits' : 'inscrit'}`;

  /** The events whose bands are lit: those of the day under the pointer or focus. */
  let lit = $state<readonly string[]>([]);
  const lights = (cell: CalendarCell) => ({
    onpointerenter: () => (lit = cell.eventIds),
    onpointerleave: () => (lit = []),
    onfocus: () => (lit = cell.eventIds),
    onblur: () => (lit = []),
  });
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
  </div>
{/snippet}

{#snippet band(
  cell: CalendarCell,
  painted: NonNullable<CalendarCell['painted']>,
  tag: 'a' | 'button' | 'span',
  attrs: Record<string, unknown>,
)}
  {@const event = calendar.events[painted.id]}
  {@const others = cell.eventIds.slice(1)}
  <svelte:element
    this={tag}
    {...attrs}
    class={cn(
      'relative flex h-7.5 w-full items-center justify-center font-mono text-xs font-bold text-[var(--band-ink)] transition-colors',
      runCorners(painted),
      lit.includes(event.id)
        ? 'bg-[color-mix(in_oklab,var(--band-color),var(--band-ink)_25%)]'
        : 'bg-[var(--band-color)]',
      tag !== 'span' && 'cursor-pointer',
    )}
    style:--band-color={bandOf(event).color}
    style:--band-ink={bandOf(event).ink}
  >
    {cell.dayOfMonth}
    {#if others.length}
      <span aria-hidden="true" class="absolute top-0.5 right-0.5 flex gap-0.5">
        {#each others.slice(0, 3) as id (id)}
          <span
            class="size-1.5 rounded-full bg-[var(--band-color)] ring-1 ring-card"
            style:--band-color={bandOf(calendar.events[id]).color}
          ></span>
        {/each}
      </span>
    {/if}
  </svelte:element>
{/snippet}

{#snippet sharedDay(cell: CalendarCell, month: CalendarMonth)}
  {@const events = eventsOf(cell)}
  <Popover.Root>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props: tooltipProps })}
          <Popover.Trigger>
            {#snippet child({ props: popoverProps })}
              {@render band(
                cell,
                cell.painted!,
                'button',
                mergeProps(tooltipProps, popoverProps, lights(cell), {
                  type: 'button',
                  'aria-label': `${cell.dayOfMonth} ${month.name}, ${events.length} événements : ${events.map((e) => e.name).join(', ')}`,
                }),
              )}
            {/snippet}
          </Popover.Trigger>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{@render eventTip(cell)}</Tooltip.Content>
    </Tooltip.Root>
    <Popover.Content align="start" class="w-72 p-1.5">
      <p class="px-2 pt-1 pb-2 epi-overline text-muted-foreground">
        {events.length} événements le {cell.dayOfMonth}
        {month.name}
      </p>
      <ul class="flex max-h-[40svh] flex-col overflow-y-auto">
        {#each events as event (event.id)}
          {@const href = hrefOf(event.id)}
          <li>
            <svelte:element
              this={href ? 'a' : 'div'}
              {href}
              class={cn(
                'flex items-center gap-2.5 rounded-sm px-2 py-2',
                href && 'cursor-pointer transition-colors hover:bg-accent',
              )}
            >
              <span
                aria-hidden="true"
                class="h-8 w-1 shrink-0 rounded-full bg-[var(--band-color)]"
                style:--band-color={bandOf(event).color}
              ></span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-semibold">{event.name}</span>
                <span class="text-xs text-muted-foreground">
                  {event.daysLabel}
                </span>
              </span>
              <CalendarEventStatus {event} />
            </svelte:element>
          </li>
        {/each}
      </ul>
    </Popover.Content>
  </Popover.Root>
{/snippet}

<Tooltip.Provider delayDuration={100} disableHoverableContent>
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
              {#if cell.painted && cell.eventIds.length > 1}
                {@render sharedDay(cell, month)}
              {:else if cell.painted}
                {@const painted = cell.painted}
                {@const event = calendar.events[painted.id]}
                {@const href = hrefOf(event.id)}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      {@render band(
                        cell,
                        painted,
                        href ? 'a' : 'span',
                        mergeProps(props, lights(cell), {
                          href,
                          'aria-label': `${event.name}, ${event.daysLabel}`,
                        }),
                      )}
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
