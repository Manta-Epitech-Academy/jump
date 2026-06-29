<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import * as Popover from '$lib/components/ui/popover';
  import { mergeProps } from 'bits-ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Search from '@lucide/svelte/icons/search';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import {
    EVENT_MODULE_DEFS,
    firstEnabledModule,
    isEventModuleKey,
  } from '$lib/domain/eventModules';
  import { eventDisplayName } from '$lib/domain/event';
  import { foldText, matchScore } from '$lib/domain/eventSearch';
  import { MOIS_FR } from '$lib/domain/schoolYear';

  // Client-safe shape of a workspace event (a subset of the server's
  // WorkspaceEventEntry; not imported from $lib/server).
  type SwitcherEvent = {
    id: string;
    titre: string;
    publicName: string | null;
    externalId: string | null;
    date: string | Date;
    schoolYear: { label: string; startYear: number };
    monthKey: string; // "YYYY-MM" in campus tz
    modules: string[];
  };

  let {
    events,
    currentId,
  }: {
    events: SwitcherEvent[];
    currentId: string;
  } = $props();

  const current = $derived(events.find((e) => e.id === currentId) ?? null);

  // Epitech reasons by school year, so the year is the picker's backbone: one
  // year shown at a time, switched with the arrows. The real data is small
  // (a campus runs ~16-32 events a year, most months hold 1-2), so the month is
  // a section header to scan, never a click-through filter.
  const years = $derived.by(() => {
    const seen = new Map<string, number>(); // label -> startYear
    for (const e of events)
      seen.set(e.schoolYear.label, e.schoolYear.startYear);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  });

  let selectedYear = $state('');
  let query = $state('');
  let open = $state(false);
  let listEl = $state<HTMLElement>();
  let inputEl = $state<HTMLInputElement>();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
  // Search results span every year, so their date carries the year to stay
  // unambiguous (the browse list gets the year from its month header instead).
  const dateFmtYear = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Accent-folded query, computed once. Empty => browse mode (year nav + month
  // groups); non-empty => search mode (flat, ranked, across all years).
  const q = $derived(foldText(query.trim()));
  const querying = $derived(q.length > 0);

  // Each time the picker opens, re-anchor on the event in view (its year), clear
  // any stale search, and focus the box so it's type-to-search. In-popover year
  // browsing doesn't touch `current`, so it isn't clobbered mid-pick (navigating
  // closes the popover before `current` changes).
  $effect(() => {
    if (open) {
      query = '';
      if (current) selectedYear = current.schoolYear.label;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  // On open in browse mode, scroll the month of the event in view to the top, so
  // the picker opens centered on "now" without breaking the timeline (scroll up
  // for the past, down for what's coming).
  $effect(() => {
    if (open && !querying && listEl) {
      requestAnimationFrame(() => {
        listEl
          ?.querySelector('[data-current="true"]')
          ?.scrollIntoView({ block: 'start' });
      });
    }
  });

  const yearIndex = $derived(years.indexOf(selectedYear));
  const monthName = (key: string) => MOIS_FR[Number(key.slice(5, 7))];

  // What each event matches on: its friendly name, the SF campaign titre (so a
  // row stays findable by the name devs know in Salesforce, even once it has a
  // public name), the date (with and without year), and the school year.
  function searchFields(e: SwitcherEvent): string[] {
    const d = new Date(e.date);
    return [
      eventDisplayName(e),
      e.titre,
      dateFmtYear.format(d),
      dateFmt.format(d),
      e.schoolYear.label,
    ].map(foldText);
  }

  // Search mode: every event across all years, ranked by match relevance then
  // most-recent first. Returns nothing in browse mode (`groups` renders then).
  const searchResults = $derived.by(() => {
    if (!querying) return [];
    return events
      .map((e) => ({ e, score: matchScore(q, searchFields(e)) }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.e.date).getTime() - new Date(a.e.date).getTime(),
      )
      .map((r) => r.e);
  });

  // Browse mode: the selected year's events grouped by month, plain
  // chronological (a real timeline). Empty while searching.
  const groups = $derived.by(() => {
    if (querying) return [];
    const pool = events.filter((e) => e.schoolYear.label === selectedYear);
    const byMonth = new Map<string, SwitcherEvent[]>();
    for (const e of pool) {
      const arr = byMonth.get(e.monthKey);
      if (arr) arr.push(e);
      else byMonth.set(e.monthKey, [e]);
    }
    const currentKey =
      current && current.schoolYear.label === selectedYear
        ? current.monthKey
        : null;
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

  // The rows in render order (search results, else the browse groups
  // flattened): the spine the keyboard cursor walks.
  const flatEvents = $derived(
    querying ? searchResults : groups.flatMap((g) => g.events),
  );
  const navIndex = $derived(
    new Map(flatEvents.map((e, i) => [e.id, i] as const)),
  );

  let activeIndex = $state(0);
  // Re-anchor the highlight whenever the visible list changes: the top result
  // while searching, the current event while browsing. Arrow keys move it
  // without touching these inputs, so they aren't clobbered mid-navigation.
  $effect(() => {
    activeIndex = querying ? 0 : current ? (navIndex.get(current.id) ?? 0) : 0;
  });

  function scrollActiveIntoView() {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  // The box is a mini command palette: arrows move the highlight, Enter goes,
  // Escape clears the search (then, when empty, lets the popover close).
  function onSearchKeydown(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (flatEvents.length) {
        activeIndex = (activeIndex + 1) % flatEvents.length;
        scrollActiveIntoView();
      }
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (flatEvents.length) {
        activeIndex = (activeIndex - 1 + flatEvents.length) % flatEvents.length;
        scrollActiveIntoView();
      }
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const e = flatEvents[activeIndex];
      if (e) pick(e);
    } else if (ev.key === 'Escape' && query) {
      ev.preventDefault();
      ev.stopPropagation();
      query = '';
    }
  }

  // Keep the same surface when switching: if the new event exposes the surface
  // currently open, stay on it; otherwise land on its first enabled surface,
  // or the dev home when it exposes nothing reachable.
  function currentSegment(): string {
    const m = page.url.pathname.match(/\/staff\/dev\/events\/[^/]+\/([^/?]+)/);
    return m?.[1] ?? '';
  }
  function targetFor(e: SwitcherEvent): string {
    const seg = currentSegment();
    if (seg && isEventModuleKey(seg) && e.modules.includes(seg)) {
      return resolve(`/staff/dev/events/${e.id}/${seg}`);
    }
    const first = firstEnabledModule(e.modules);
    return first
      ? resolve(`/staff/dev/events/${e.id}/${EVENT_MODULE_DEFS[first].segment}`)
      : resolve('/staff/dev');
  }

  function pick(e: SwitcherEvent) {
    open = false;
    if (e.id !== currentId) goto(targetFor(e));
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
                class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-sidebar-border bg-sidebar-hover text-sidebar-foreground-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
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
    <div class="flex items-center gap-2 border-b px-3 py-2">
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <input
        bind:value={query}
        bind:this={inputEl}
        onkeydown={onSearchKeydown}
        placeholder="Aller à un événement…"
        aria-label="Rechercher un événement"
        class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>

    {#if selectedYear && !querying}
      <div class="flex items-center justify-between border-b px-2 py-1.5">
        <button
          type="button"
          aria-label="Année précédente"
          disabled={yearIndex >= years.length - 1}
          onclick={() => (selectedYear = years[yearIndex + 1])}
          class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft class="size-4" />
        </button>
        <span class="text-xs font-semibold">{selectedYear}</span>
        <button
          type="button"
          aria-label="Année suivante"
          disabled={yearIndex <= 0}
          onclick={() => (selectedYear = years[yearIndex - 1])}
          class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>
    {/if}

    <Tooltip.Provider delayDuration={150}>
      <div bind:this={listEl} class="max-h-72 overflow-y-auto px-1 pb-1">
        {#snippet eventRow(e: SwitcherEvent, dateLabel: string)}
          {@const idx = navIndex.get(e.id) ?? -1}
          <!--
            Shared row for both modes (browse groups + flat search results). The
            raw Salesforce campaign name is too long for the row and re-states
            the campus and date already on screen, so it rides in a hover tooltip
            behind the Salesforce glyph: a read-only glance to check the friendly
            name against the campaign, no navigation. Row click switches event;
            the glyph is a separate control, so the two don't nest. The cursor
            (keyboard/hover) is a filled background; the current event keeps a
            subtle ring so it stays marked even when the cursor moves elsewhere.
          -->
          <div
            data-active={idx === activeIndex}
            class={cn(
              'flex items-center rounded-sm transition-colors hover:bg-accent',
              idx === activeIndex && 'bg-accent',
              e.id === currentId && 'ring-1 ring-border ring-inset',
            )}
          >
            <button
              onclick={() => pick(e)}
              onmouseenter={() => (activeIndex = idx)}
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

        {#if querying}
          {#each searchResults as e (e.id)}
            {@render eventRow(e, dateFmtYear.format(new Date(e.date)))}
          {:else}
            <p class="px-2 py-6 text-center text-xs text-muted-foreground">
              Aucun événement trouvé.
            </p>
          {/each}
        {:else}
          {#each groups as g (g.key)}
            <div
              data-current={g.isCurrent}
              class="sticky top-0 z-10 flex items-baseline gap-1.5 bg-popover px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
            >
              <span>{g.name}</span>
              <span class="font-normal opacity-60">{g.year}</span>
            </div>
            {#each g.events as e (e.id)}
              {@render eventRow(e, dateFmt.format(new Date(e.date)))}
            {/each}
          {:else}
            <p class="px-2 py-6 text-center text-xs text-muted-foreground">
              Aucun événement.
            </p>
          {/each}
        {/if}
      </div>
    </Tooltip.Provider>
  </Popover.Content>
</Popover.Root>
