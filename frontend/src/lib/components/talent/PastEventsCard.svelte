<script lang="ts">
  import { resolve } from '$app/paths';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { eventDisplayName } from '$lib/domain/event';
  import type { AttendedEvent } from '$lib/server/talent/attendedEvents';

  // The latest events the talent attended, on « Mon parcours », with the way to
  // all of them. It lives behind the XP card and not on the home, which keeps
  // only the one thing to do now.
  let { events, timeZone }: { events: AttendedEvent[]; timeZone: string } =
    $props();

  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="overflow-hidden rounded-xl border border-border bg-card shadow-raised"
>
  <div
    class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
  >
    <CalendarCheck class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2 id={titleId} class="font-heading text-display-s text-foreground">
      Événements passés<TitleCursor />
    </h2>
  </div>

  <!-- Date left, name right. The date column sizes to the widest date, so
       every name starts at the same x instead of jittering with "4 avr." vs
       "14 mars". -->
  <div
    class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 px-6 pt-4 pb-2"
  >
    {#each events as ev (ev.id)}
      <span class="text-xs text-muted-foreground">
        {new Date(ev.date).toLocaleDateString('fr-FR', {
          timeZone,
          day: 'numeric',
          month: 'short',
        })}
      </span>
      <span
        class="min-w-0 truncate text-sm font-medium text-foreground-secondary"
      >
        {eventDisplayName(ev)}
      </span>
    {/each}
  </div>

  <div class="flex justify-center pb-4">
    <a
      href={resolve('/events')}
      class="group inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground transition-ui hover:bg-epi-blue/10 hover:text-epi-blue dark:hover:bg-epi-blue/20"
    >
      <CalendarCheck class="h-3 w-3" />
      Voir tout
      <ArrowRight
        class="h-3 w-3 transition-transform group-hover:translate-x-0.5"
      />
    </a>
  </div>
</section>
