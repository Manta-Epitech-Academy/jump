<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { formatDateFr } from '$lib/utils';
  import { presenceLabel } from '$lib/domain/sfMemberStatus';

  // Past events only, resolved server-side (name + présent/absent already
  // decided): this component just paints the list.
  export type TalentEventHistoryEntry = {
    id: string;
    name: string;
    date: string | Date;
    presence: 'present' | 'absent' | null;
  };

  let {
    events = [],
    timezone,
  }: {
    events: TalentEventHistoryEntry[];
    timezone: string;
  } = $props();
</script>

{#if events.length === 0}
  <div
    class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-6 text-center"
  >
    <CalendarDays class="h-8 w-8 text-muted-foreground opacity-30" />
    <h3
      class="mt-3 text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      Aucun événement
    </h3>
    <p class="mt-1 max-w-[250px] text-xs text-muted-foreground">
      Ce talent n'a participé à aucun événement.
    </p>
  </div>
{:else}
  <!-- Nom tout à gauche, date tout à droite : `flex-1` sur le nom pousse la date
       jusqu'au bord. La date mono est à largeur fixe, donc les dates s'alignent en
       une colonne nette à droite. -->
  <ul class="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
    {#each events as ev (ev.id)}
      <li class="flex items-center gap-4">
        <span class="min-w-0 flex-1 truncate font-medium text-foreground">
          {ev.name}
        </span>
        {#if ev.presence}
          <span
            class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium {ev.presence ===
            'present'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}"
          >
            {presenceLabel(ev.presence)}
          </span>
        {/if}
        <span
          class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
        >
          {formatDateFr(ev.date, timezone)}
        </span>
      </li>
    {/each}
  </ul>
{/if}
