<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import * as Popover from '$lib/components/ui/popover';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
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
    month: number;
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

  // The picker drills down: school year first, then month, then the events of
  // that month. Epitech reasons by school year; a busy campus has many events
  // across months, so a flat list was unwieldy.
  const years = $derived.by(() => {
    const seen = new Map<string, number>(); // label -> startYear
    for (const e of events)
      seen.set(e.schoolYear.label, e.schoolYear.startYear);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  });

  // Order months along the school year (Sept → Aug), not the calendar year, so
  // a year that spans the new year reads in the right sequence.
  const scholarRank = (m: number) => (m >= 9 ? m - 12 : m);
  function monthsOf(yearLabel: string): number[] {
    const set = new Set<number>();
    for (const e of events)
      if (e.schoolYear.label === yearLabel) set.add(e.month);
    return [...set].sort((a, b) => scholarRank(a) - scholarRank(b));
  }

  let selectedYear = $state('');
  let selectedMonth = $state(0);
  // Re-anchor on the current event whenever it changes (a navigation), so
  // reopening the picker lands on the event in view. A user's in-popover
  // drill-down doesn't touch `current`, so it isn't clobbered mid-pick.
  $effect(() => {
    if (current) {
      selectedYear = current.schoolYear.label;
      selectedMonth = current.month;
    }
  });

  const monthsForYear = $derived(monthsOf(selectedYear));
  const eventsForSelection = $derived(
    events
      .filter(
        (e) => e.schoolYear.label === selectedYear && e.month === selectedMonth,
      )
      .sort((a, b) => {
        if (a.status !== b.status)
          return STATUS_RANK[a.status] - STATUS_RANK[b.status];
        const ta = new Date(a.date).getTime();
        const tb = new Date(b.date).getTime();
        return a.status === 'upcoming' ? ta - tb : tb - ta;
      }),
  );

  function selectYear(label: string) {
    selectedYear = label;
    const months = monthsOf(label);
    if (!months.includes(selectedMonth)) selectedMonth = months[0] ?? 0;
  }

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

  let open = $state(false);
  function pick(e: SwitcherEvent) {
    open = false;
    if (e.id !== currentId) goto(targetFor(e));
  }

  const chipClass = (active: boolean) =>
    cn(
      'rounded-sm px-2 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-epi-pink text-white'
        : 'bg-muted text-muted-foreground hover:bg-muted/70',
    );
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        aria-label="Changer d'événement"
        class="flex w-full items-center justify-between gap-2 rounded-sm border border-sidebar-border bg-sidebar-hover px-3 py-1.5 text-left text-sm font-bold text-sidebar-foreground"
      >
        <span class="truncate"
          >{current ? eventDisplayName(current) : 'Événement'}</span
        >
        <ChevronsUpDown class="h-4 w-4 shrink-0 opacity-60" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-72 space-y-2 p-2">
    <div class="flex flex-wrap gap-1">
      {#each years as y (y)}
        <button
          class={chipClass(y === selectedYear)}
          onclick={() => selectYear(y)}
        >
          {y}
        </button>
      {/each}
    </div>
    <div class="flex flex-wrap gap-1">
      {#each monthsForYear as m (m)}
        <button
          class={chipClass(m === selectedMonth)}
          onclick={() => (selectedMonth = m)}
        >
          {MOIS_FR[m]}
        </button>
      {/each}
    </div>
    <div class="max-h-64 space-y-1 overflow-y-auto">
      {#each eventsForSelection as e (e.id)}
        <button
          onclick={() => pick(e)}
          class={cn(
            'flex w-full min-w-0 flex-col rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent',
            e.id === currentId && 'bg-accent',
          )}
        >
          <span class="truncate text-sm font-medium">{eventDisplayName(e)}</span
          >
          <span class="text-xs text-muted-foreground">
            {STATUS_LABEL[e.status]} · {dateFmt.format(new Date(e.date))}
          </span>
        </button>
      {:else}
        <p class="px-2 py-3 text-center text-xs text-muted-foreground">
          Aucun événement ce mois-ci.
        </p>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
