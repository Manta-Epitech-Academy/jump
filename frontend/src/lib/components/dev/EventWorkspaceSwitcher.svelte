<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import * as Popover from '$lib/components/ui/popover';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Search from '@lucide/svelte/icons/search';
  import { cn } from '$lib/utils';
  import {
    EVENT_MODULE_DEFS,
    firstEnabledModule,
    isEventModuleKey,
  } from '$lib/domain/eventModules';
  import { eventDisplayName } from '$lib/domain/event';
  import { MOIS_FR } from '$lib/domain/schoolYear';

  // Client-safe shape of a workspace event (a subset of the server's
  // WorkspaceEventEntry; not imported from $lib/server).
  type SwitcherEvent = {
    id: string;
    titre: string;
    publicName: string | null;
    date: string | Date;
    status: 'past' | 'ongoing' | 'upcoming';
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

  const STATUS_RANK: Record<SwitcherEvent['status'], number> = {
    ongoing: 0,
    upcoming: 1,
    past: 2,
  };
  const STATUS_LABEL: Record<SwitcherEvent['status'], string> = {
    ongoing: 'En cours',
    upcoming: 'À venir',
    past: 'Passé',
  };

  // Within a month, surface what's live first (en cours, then à venir soonest,
  // then passé most-recent).
  function sortEvents(a: SwitcherEvent, b: SwitcherEvent): number {
    if (a.status !== b.status)
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return a.status === 'upcoming' ? ta - tb : tb - ta;
  }

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

  // Each time the picker opens, re-anchor on the event in view (its year) and
  // clear any stale search. A user's in-popover year browsing doesn't touch
  // `current`, so it isn't clobbered mid-pick (navigating closes the popover
  // before `current` changes).
  $effect(() => {
    if (open) {
      query = '';
      if (current) selectedYear = current.schoolYear.label;
    }
  });

  // On open, scroll the month of the event in view to the top of the list, so
  // the picker opens centered on "now" without breaking the chronological order
  // (scroll up for the past, down for what's coming).
  let listEl = $state<HTMLElement>();
  $effect(() => {
    if (open && !query.trim() && listEl) {
      requestAnimationFrame(() => {
        listEl
          ?.querySelector('[data-current="true"]')
          ?.scrollIntoView({ block: 'start' });
      });
    }
  });

  const yearIndex = $derived(years.indexOf(selectedYear));
  const monthName = (key: string) => MOIS_FR[Number(key.slice(5, 7))];

  // The selected year's events, filtered by the search, grouped by month. Month
  // order: the month of the event in view first (so reopening lands on it), then
  // the rest most-recent-first. While searching, just most-recent.
  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const pool = events.filter(
      (e) =>
        e.schoolYear.label === selectedYear &&
        (!q || eventDisplayName(e).toLowerCase().includes(q)),
    );
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
    // Plain chronological order - a real timeline. Yanking the current month to
    // the front read as "juin -> juillet -> mai" (non-monotone, confusing); the
    // current month is brought into view by scrolling instead (see the open
    // effect), so the past stays above it and the future below.
    const keys = [...byMonth.keys()].sort();
    // A school year straddles two calendar years (Sept-Dec 2025, then Jan-Jul
    // 2026), so scrolling up into the autumn months, "décembre" alone is
    // ambiguous. Every header carries its calendar year (shown muted beside the
    // month name) - which also disambiguates the July/August bookend for free.
    return keys.map((k) => ({
      key: k,
      name: monthName(k),
      year: k.slice(0, 4),
      isCurrent: k === currentKey,
      events: byMonth.get(k)!.slice().sort(sortEvents),
    }));
  });

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

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
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        aria-label="Changer d'événement"
        title="Changer d'événement"
        class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-sidebar-border bg-sidebar-hover text-sidebar-foreground-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
      >
        <ChevronDown class="size-4" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-72 p-0">
    <div class="flex items-center gap-2 border-b px-3 py-2">
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <input
        bind:value={query}
        placeholder="Aller à un événement…"
        aria-label="Rechercher un événement"
        class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>

    {#if selectedYear}
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

    <div bind:this={listEl} class="max-h-72 overflow-y-auto px-1 pb-1">
      {#each groups as g (g.key)}
        <div
          data-current={g.isCurrent}
          class="sticky top-0 z-10 flex items-baseline gap-1.5 bg-popover px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <span>{g.name}</span>
          <span class="font-normal opacity-60">{g.year}</span>
        </div>
        {#each g.events as e (e.id)}
          <button
            onclick={() => pick(e)}
            class={cn(
              'flex w-full min-w-0 cursor-pointer flex-col rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent',
              e.id === currentId && 'bg-accent',
            )}
          >
            <span class="truncate text-sm font-medium"
              >{eventDisplayName(e)}</span
            >
            <span
              class={cn(
                'text-xs text-muted-foreground',
                e.status === 'ongoing' && 'text-epi-teal-solid',
              )}
            >
              {STATUS_LABEL[e.status]} · {dateFmt.format(new Date(e.date))}
            </span>
          </button>
        {/each}
      {:else}
        <p class="px-2 py-6 text-center text-xs text-muted-foreground">
          {query.trim() ? 'Aucun événement trouvé.' : 'Aucun événement.'}
        </p>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
