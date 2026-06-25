<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import * as Select from '$lib/components/ui/select';
  import {
    EVENT_MODULE_DEFS,
    firstEnabledModule,
    isEventModuleKey,
  } from '$lib/domain/eventModules';

  // Client-safe shape of a workspace event (a subset of the server's
  // WorkspaceEventEntry; not imported from $lib/server).
  type SwitcherEvent = {
    id: string;
    titre: string;
    date: string | Date;
    status: 'past' | 'ongoing' | 'upcoming';
    schoolYear: { label: string };
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

  // Group by school year (most recent first), then within a year: ongoing,
  // upcoming (soonest first), past (most recent first).
  const groups = $derived.by(() => {
    const byYear = new Map<string, SwitcherEvent[]>();
    for (const e of events) {
      const key = e.schoolYear.label;
      (byYear.get(key) ?? byYear.set(key, []).get(key)!).push(e);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([label, evs]) => ({
        label,
        events: [...evs].sort((a, b) => {
          if (a.status !== b.status)
            return STATUS_RANK[a.status] - STATUS_RANK[b.status];
          const ta = new Date(a.date).getTime();
          const tb = new Date(b.date).getTime();
          return a.status === 'upcoming' ? ta - tb : tb - ta;
        }),
      }));
  });

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

  // Keep the same surface when switching: if the new event exposes the surface
  // currently open, stay on it; otherwise land on its first enabled surface,
  // or its Paramètres page when it exposes nothing reachable.
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
      : resolve(`/staff/dev/events/${e.id}`);
  }

  function onValueChange(id: string) {
    const e = events.find((ev) => ev.id === id);
    if (e && id !== currentId) goto(targetFor(e));
  }
</script>

<Select.Root type="single" value={currentId} {onValueChange}>
  <Select.Trigger
    size="sm"
    aria-label="Changer d'événement"
    class="w-full justify-between rounded-sm border-sidebar-border bg-sidebar-hover text-left font-bold text-sidebar-foreground"
  >
    <span class="truncate">{current?.titre ?? 'Événement'}</span>
  </Select.Trigger>
  <Select.Content class="max-h-80">
    {#each groups as group (group.label)}
      <Select.Group>
        <Select.GroupHeading>{group.label}</Select.GroupHeading>
        {#each group.events as e (e.id)}
          <Select.Item value={e.id} label={e.titre}>
            <span class="flex min-w-0 flex-col">
              <span class="truncate">{e.titre}</span>
              <span class="text-xs text-muted-foreground">
                {STATUS_LABEL[e.status]} · {dateFmt.format(new Date(e.date))}
              </span>
            </span>
          </Select.Item>
        {/each}
      </Select.Group>
    {/each}
  </Select.Content>
</Select.Root>
