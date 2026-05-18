<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';

  type Activity = {
    activity: { timeSlot: { startTime: Date | string } | null };
  };

  type Participation = {
    id: string;
    isPresent: boolean;
    event: {
      titre: string;
      date: Date | string;
      endDate: Date | string | null;
    };
    activities: Activity[];
  };

  let {
    participation,
    timezone,
  }: { participation: Participation | null; timezone: string } = $props();

  type Cell = {
    date: Date;
    state: 'present' | 'absent' | 'no-data';
    label: string;
  };

  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function sameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      timeZone: timezone,
    });
  }

  const cells = $derived.by<Cell[]>(() => {
    if (!participation) return [];
    const start = startOfDay(new Date(participation.event.date));
    const endRaw = participation.event.endDate
      ? new Date(participation.event.endDate)
      : new Date(participation.event.date);
    const end = startOfDay(endRaw);
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime() && days.length < 10) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const activeDates = new Set(
      participation.activities
        .map((pa) => pa.activity.timeSlot?.startTime)
        .filter(Boolean)
        .map((ts) => startOfDay(new Date(ts as Date | string)).getTime()),
    );

    return days.map<Cell>((d) => {
      const wasActive = activeDates.has(d.getTime());
      let state: Cell['state'];
      if (!participation.isPresent) {
        state = 'absent';
      } else if (wasActive) {
        state = 'present';
      } else {
        state = 'no-data';
      }
      return { date: d, state, label: formatDate(d) };
    });
  });

  // Charte: success → epi-teal-solid, destructive → epi-orange. Alpha-based
  // surfaces work in both light and dark modes without per-mode overrides.
  const cellClass = (state: Cell['state']) =>
    state === 'present'
      ? 'border-epi-teal-solid/30 bg-epi-teal-solid/10 text-epi-teal-solid'
      : state === 'absent'
        ? 'border-epi-orange/40 bg-epi-orange/10 text-epi-orange'
        : 'border-border bg-muted/40 text-muted-foreground';
</script>

{#if participation}
  <div class="space-y-2">
    <p
      class="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      <CalendarDays class="h-3 w-3 text-epi-blue" />
      {participation.event.titre}
    </p>
    <div class="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
      {#each cells as cell, idx (cell.date.getTime())}
        <Tooltip.Provider delayDuration={150}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              <span
                class={cn(
                  'flex aspect-square items-center justify-center rounded-sm border text-[10px] font-bold tabular-nums',
                  cellClass(cell.state),
                )}
                aria-label={`Jour ${idx + 1} : ${cell.label}`}
              >
                J{idx + 1}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p class="text-xs">
                {cell.label} —
                {cell.state === 'present'
                  ? 'Présent'
                  : cell.state === 'absent'
                    ? 'Absent'
                    : 'Aucune activité'}
              </p>
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/each}
    </div>
  </div>
{/if}
