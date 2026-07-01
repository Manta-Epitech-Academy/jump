<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { formatDateFr } from '$lib/utils';
  import { eventDisplayName } from '$lib/domain/event';

  export type PastEvent = {
    id: string;
    titre: string;
    publicName?: string | null;
    date: string | Date;
  };

  let {
    events = [],
    timezone,
  }: {
    events: PastEvent[];
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
      <li class="flex items-baseline gap-4">
        <span class="min-w-0 flex-1 truncate font-medium text-foreground">
          {eventDisplayName(ev)}
        </span>
        <span
          class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
        >
          {formatDateFr(ev.date, timezone)}
        </span>
      </li>
    {/each}
  </ul>
{/if}
