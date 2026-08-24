<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { mergeProps } from 'bits-ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import type { DevWorkspaceEvent } from '$lib/domain/devWorkspace';
  import { eventDisplayName } from '$lib/domain/event';
  import { MOIS_FR } from '$lib/domain/schoolYear';

  // The client-safe workspace shape plus what a row displays. The surface gates
  // ride along not for this component's own use but so `onpick` hands the host
  // an event it can route.
  type SwitcherEvent = DevWorkspaceEvent & {
    titre: string;
    publicName: string | null;
    externalId: string | null;
    monthKey: string; // "YYYY-MM" in campus tz
  };

  let {
    events,
    currentId,
    schoolYear,
    onpick,
  }: {
    /** The active year's navigable events. Scoping is the host's job. */
    events: SwitcherEvent[];
    currentId: string;
    /** The active school year, for the list's own label. */
    schoolYear: string;
    onpick: (event: SwitcherEvent) => void;
  } = $props();

  const current = $derived(events.find((e) => e.id === currentId) ?? null);

  let open = $state(false);
  let listEl = $state<HTMLElement>();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

  // On open, scroll the month of the event in view to the top, so the picker
  // opens centered on "now" without breaking the timeline (scroll up for the
  // past, down for what's coming).
  $effect(() => {
    if (open && listEl) {
      requestAnimationFrame(() => {
        listEl
          ?.querySelector('[data-current="true"]')
          ?.scrollIntoView({ block: 'start' });
      });
    }
  });

  const monthName = (key: string) => MOIS_FR[Number(key.slice(5, 7))];

  // The year's events grouped by month, plain chronological (a real timeline).
  // Epitech reasons by school year, so the year is the list's scope; the real
  // data is small (a campus runs ~16-32 events a year, most months hold 1-2), so
  // the month is a section header to scan, never a click-through filter.
  const groups = $derived.by(() => {
    const byMonth = new Map<string, SwitcherEvent[]>();
    for (const e of events) {
      const arr = byMonth.get(e.monthKey);
      if (arr) arr.push(e);
      else byMonth.set(e.monthKey, [e]);
    }
    const currentKey = current?.monthKey ?? null;
    // Yanking the current month to the front read as "juin -> juillet -> mai"
    // (non-monotone, confusing); it's brought into view by scrolling instead
    // (see the open effect), so the past stays above it and the future below.
    const keys = [...byMonth.keys()].sort();
    // A school year straddles two calendar years (Sept-Dec 2025, then Jan-Jul
    // 2026), so "décembre" alone is ambiguous up in the autumn. Every header
    // carries its calendar year (muted, beside the month name) - which also
    // disambiguates the July/August bookend for free.
    return keys.map((k) => ({
      key: k,
      name: monthName(k),
      year: k.slice(0, 4),
      isCurrent: k === currentKey,
      events: byMonth
        .get(k)!
        .slice()
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
    }));
  });

  // Navigating is the host's job: the year menu and this list resolve to the
  // same jump (keep the surface in view when the target event exposes it), so
  // the layout owns it once and both controls call into it.
  function pick(e: SwitcherEvent) {
    open = false;
    onpick(e);
  }
</script>

<Popover.Root bind:open>
  <!-- The chevron both opens the picker and carries a hover hint, so it is a
       Popover trigger AND a Tooltip trigger on one element: nest the two `child`
       snippets and spread both prop bags (the house pattern, see ModeToggle). A
       native `title` was used before, which clashed with the dark sidebar and
       the shadcn tooltip on the Salesforce glyph in the rows below. -->
  <Tooltip.Provider delayDuration={150}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props: tooltipProps })}
          <Popover.Trigger>
            {#snippet child({ props: popoverProps })}
              <!-- One button is both triggers, so merge the two prop bags rather
                   than spreading them: Popover.Trigger also defines
                   onpointerenter/leave, which would otherwise overwrite the
                   tooltip's hover handlers and leave it stuck open-once (its
                   onpointerleave never fires to re-arm the next hover).
                   mergeProps chains the handlers so both fire. -->
              <button
                {...mergeProps(tooltipProps, popoverProps)}
                aria-label="Changer d'événement"
                class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-chrome-border bg-chrome-hover text-chrome-foreground-muted transition-colors hover:bg-white/10 hover:text-chrome-foreground"
              >
                <ChevronDown class="size-4" />
              </button>
            {/snippet}
          </Popover.Trigger>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="right">Changer d'événement</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Popover.Content align="start" class="w-80 p-0">
    <!-- The list is the active school year, and nothing else: the year is the
         workspace's global context and it is changed in the header. This label
         is what keeps the list self-describing, which matters more than it
         looks: a school year straddles two calendar years, so two different
         years both show a "juillet 2026" month header below. -->
    <div class="border-b px-2 py-1.5">
      <span class="text-xs font-semibold">{schoolYear}</span>
    </div>

    <Tooltip.Provider delayDuration={150}>
      <div bind:this={listEl} class="max-h-72 overflow-y-auto px-1 pb-1">
        {#snippet eventRow(e: SwitcherEvent, dateLabel: string)}
          <!--
            Row for the browse list. The raw Salesforce campaign name is too long
            for the row and re-states the campus and date already on screen, so it
            rides in a hover tooltip behind the Salesforce glyph: a read-only
            glance to check the friendly name against the campaign, no navigation.
            Row click switches event; the glyph is a separate control, so the two
            don't nest. Hover fills the row; the current event keeps a subtle ring
            so it stays marked.
          -->
          <div
            class={cn(
              'flex items-center rounded-sm transition-colors hover:bg-accent',
              e.id === currentId && 'ring-1 ring-border ring-inset',
            )}
          >
            <button
              onclick={() => pick(e)}
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            >
              <span class="min-w-0 flex-1 truncate text-sm font-medium"
                >{eventDisplayName(e)}</span
              >
              <span class="shrink-0 text-xs text-muted-foreground"
                >{dateLabel}</span
              >
            </button>
            {#if e.externalId}
              <Tooltip.Root>
                <Tooltip.Trigger
                  type="button"
                  aria-label="Voir le nom de la campagne Salesforce"
                  class="mr-2 flex shrink-0 cursor-help items-center rounded-sm p-0.5 transition-opacity hover:opacity-70"
                >
                  <SalesforceIcon class="size-3.5" />
                </Tooltip.Trigger>
                <Tooltip.Content side="right" class="whitespace-nowrap">
                  {e.titre}
                </Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>
        {/snippet}

        {#each groups as g (g.key)}
          <div
            data-current={g.isCurrent}
            class="sticky top-0 z-10 flex items-baseline gap-1.5 bg-popover px-2 pt-2 pb-1 epi-overline text-muted-foreground"
          >
            <span>{g.name}</span>
            <span class="font-normal opacity-60">{g.year}</span>
          </div>
          {#each g.events as e (e.id)}
            {@render eventRow(e, dateFmt.format(new Date(e.date)))}
          {/each}
        {/each}
      </div>
    </Tooltip.Provider>
  </Popover.Content>
</Popover.Root>
